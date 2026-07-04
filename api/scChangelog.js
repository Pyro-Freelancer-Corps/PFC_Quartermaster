const express = require('express');
const router = express.Router();
const { ScChangelogEntry, sequelize } = require('../config/database');

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

    const where = { versionFrom: from, versionTo: to };
    if (category) where.category = category;

    const rows = await ScChangelogEntry.findAll({
      where,
      order: [['category', 'ASC'], ['recordName', 'ASC']],
    });

    const entries = rows.map(r => ({
      category: r.category,
      recordRef: r.recordRef,
      recordName: r.recordName,
      recordType: r.recordType,
      fieldKey: r.fieldKey,
      label: r.label,
      unit: r.unit,
      oldValue: r.oldValue,
      newValue: r.newValue,
    }));

    res.json({ versionFrom: from, versionTo: to, entries });
  } catch (err) {
    console.error('Failed to load sc-changelog:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/versions', listVersions);
router.get('/', listChangelog);

module.exports = { router, listChangelog, listVersions };
