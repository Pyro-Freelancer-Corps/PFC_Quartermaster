const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ScChangelogEntry, sequelize } = require('../config/database');

function mapRow(r) {
  return {
    category: r.category,
    recordRef: r.recordRef,
    recordName: r.recordName,
    recordDisplayName: r.recordDisplayName,
    recordType: r.recordType,
    fieldKey: r.fieldKey,
    label: r.label,
    unit: r.unit,
    oldValue: r.oldValue,
    newValue: r.newValue,
  };
}

// Version labels are always `${branch}_${changelist}` (see extract.py's
// version_folder_name()) -- the changelist is a P4 changelist number that
// always increases over time, so sorting by it numerically (never the raw
// label string, e.g. "4.10.0" sorts before "4.9.0" alphabetically) gives
// true chronological order regardless of branch naming.
function extractBuildKey(versionLabel) {
  const match = /_(\d+)$/.exec(versionLabel || '');
  return match ? Number(match[1]) : null;
}

// Every version label that's ever appeared on either side of a diff,
// in true chronological order. No new table needed — this is derived
// entirely from what's already in ScChangelogEntry.
async function getOrderedVersions() {
  const [fromRows, toRows] = await Promise.all([
    ScChangelogEntry.findAll({ attributes: ['versionFrom'], group: ['versionFrom'], raw: true }),
    ScChangelogEntry.findAll({ attributes: ['versionTo'], group: ['versionTo'], raw: true }),
  ]);

  const labels = new Set([
    ...fromRows.map(r => r.versionFrom),
    ...toRows.map(r => r.versionTo),
  ]);

  return [...labels]
    .filter(label => extractBuildKey(label) !== null)
    .sort((a, b) => extractBuildKey(a) - extractBuildKey(b));
}

// Ordered list of every version label from `from` to `to` inclusive
// (auto-swapped if given in reverse order). Null if either endpoint has
// no data at all.
async function findVersionPath(from, to) {
  const ordered = await getOrderedVersions();
  let fromIdx = ordered.indexOf(from);
  let toIdx = ordered.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return null;
  if (fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];
  return ordered.slice(fromIdx, toIdx + 1);
}

// Reconstructs field-level changes across a multi-hop path: for each
// tracked (record, field), the value at the path's start is the *earliest*
// hop's oldValue, and the value at the path's end is the *latest* hop's
// newValue. A hop with no row for a given field simply means that field
// didn't change there — it carries forward with no extra work needed.
async function resolveChainedChangelog(path, category) {
  const hops = [];
  for (let i = 0; i < path.length - 1; i++) {
    hops.push({ versionFrom: path[i], versionTo: path[i + 1] });
  }
  if (hops.length === 0) return [];

  const where = { [Op.or]: hops.map(h => ({ versionFrom: h.versionFrom, versionTo: h.versionTo })) };
  if (category) where.category = category;

  const rows = await ScChangelogEntry.findAll({ where, raw: true });

  const hopIndex = new Map(hops.map((h, i) => [`${h.versionFrom}->${h.versionTo}`, i]));
  const byField = new Map();
  for (const row of rows) {
    const key = `${row.recordRef}::${row.fieldKey}`;
    const hopIdx = hopIndex.get(`${row.versionFrom}->${row.versionTo}`);
    const group = byField.get(key) || [];
    group.push({ ...row, hopIdx });
    byField.set(key, group);
  }

  const entries = [];
  for (const group of byField.values()) {
    group.sort((a, b) => a.hopIdx - b.hopIdx);
    const first = group[0];
    const last = group[group.length - 1];
    if (first.oldValue === last.newValue) continue; // net no-op across the whole path (e.g. changed then reverted)
    entries.push(mapRow({ ...last, oldValue: first.oldValue, newValue: last.newValue }));
  }
  return entries;
}

async function listVersions(req, res) {
  try {
    const rows = await ScChangelogEntry.findAll({
      attributes: [
        'versionFrom',
        'versionTo',
        [sequelize.fn('MAX', sequelize.col('id')), 'lastId'],
      ],
      group: ['versionFrom', 'versionTo'],
      order: [[sequelize.fn('MAX', sequelize.col('id')), 'DESC']],
    });
    const versions = rows.map(r => ({ versionFrom: r.versionFrom, versionTo: r.versionTo }));
    res.json({ versions });
  } catch (err) {
    console.error('Failed to load sc-changelog versions:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listKnownVersions(req, res) {
  try {
    const versions = await getOrderedVersions();
    res.json({ versions });
  } catch (err) {
    console.error('Failed to load known sc-changelog versions:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listChangelog(req, res) {
  try {
    let { from, to, category } = req.query;

    if (!from || !to) {
      const latest = await ScChangelogEntry.findOne({ order: [['id', 'DESC']] });
      if (!latest) {
        return res.json({ versionFrom: null, versionTo: null, entries: [] });
      }
      from = latest.versionFrom;
      to = latest.versionTo;
    }

    const directWhere = { versionFrom: from, versionTo: to };
    if (category) directWhere.category = category;

    const directRows = await ScChangelogEntry.findAll({
      where: directWhere,
      order: [['category', 'ASC'], ['recordName', 'ASC']],
      raw: true,
    });

    let entries;
    if (directRows.length > 0) {
      // A direct match always wins when it has rows — this is the common
      // case (adjacent versions) and needs no chain-walking at all.
      entries = directRows.map(mapRow);
    } else {
      // Empty direct result is ambiguous on its own (adjacent-with-no-changes
      // looks identical to never-diffed) — resolve it against the known
      // version sequence instead of guessing.
      const path = await findVersionPath(from, to);
      if (!path) {
        return res.status(404).json({ error: `No changelog data found for '${from}' and/or '${to}'` });
      }
      if (path.length === 2) {
        // Genuinely adjacent in the sequence — the empty direct result was
        // already the correct, final answer: nothing changed.
        entries = [];
      } else {
        entries = await resolveChainedChangelog(path, category);
        entries.sort((a, b) => a.category.localeCompare(b.category) || a.recordName.localeCompare(b.recordName));
      }
    }

    res.json({ versionFrom: from, versionTo: to, entries });
  } catch (err) {
    console.error('Failed to load sc-changelog:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/versions', listVersions);
router.get('/known-versions', listKnownVersions);
router.get('/', listChangelog);

module.exports = {
  router,
  listChangelog,
  listVersions,
  listKnownVersions,
  getOrderedVersions,
  findVersionPath,
};
