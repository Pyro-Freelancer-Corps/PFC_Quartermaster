require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ScChangelogEntry } = require('../config/database');

function buildDedupeKey(versionFrom, versionTo, recordRef, fieldKey) {
  return crypto
    .createHash('sha256')
    .update(`${versionFrom}|${versionTo}|${recordRef}|${fieldKey}`)
    .digest('hex');
}

function toStringOrNull(value) {
  return value === null || value === undefined ? null : String(value);
}

async function ingestScChangelog(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  const { version_from: versionFrom, version_to: versionTo, entries } = data;
  if (!versionFrom || !versionTo || !Array.isArray(entries)) {
    throw new Error('changelog.json missing version_from/version_to/entries');
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.record_ref || !entry.field_key) {
      skipped++;
      continue;
    }

    const dedupeKey = buildDedupeKey(versionFrom, versionTo, entry.record_ref, entry.field_key);

    const [, wasCreated] = await ScChangelogEntry.upsert({
      dedupeKey,
      versionFrom,
      versionTo,
      category: entry.category,
      recordRef: entry.record_ref,
      recordName: entry.record_name,
      recordDisplayName: entry.record_display_name || null,
      recordType: entry.record_type,
      fieldKey: entry.field_key,
      label: entry.label,
      unit: entry.unit,
      oldValue: toStringOrNull(entry.old_value),
      newValue: toStringOrNull(entry.new_value),
    });

    if (wasCreated) {
      created++;
    } else {
      updated++;
    }
  }

  return { versionFrom, versionTo, created, updated, skipped, total: entries.length };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/ingestScChangelog.js <path-to-changelog.json>');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  console.log(`[SC CHANGELOG] Ingesting ${resolved} (BOT_TYPE=${process.env.BOT_TYPE || 'development'})`);

  try {
    const result = await ingestScChangelog(resolved);
    console.log(
      `[SC CHANGELOG] ${result.versionFrom} -> ${result.versionTo}: ` +
      `${result.created} created, ${result.updated} updated, ${result.skipped} skipped (of ${result.total})`
    );
    process.exit(0);
  } catch (err) {
    console.error('[SC CHANGELOG] Ingest failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ingestScChangelog, buildDedupeKey };
