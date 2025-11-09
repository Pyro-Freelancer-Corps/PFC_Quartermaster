const express = require('express');
const router = express.Router();
const { Accolade, AccoladeRecipient } = require('../config/database');

async function listAccolades(req, res) {
  try {
    const accolades = await Accolade.findAll();
    const accoladeIds = accolades.map(a => a.id);
    const recipientRows = accoladeIds.length
      ? await AccoladeRecipient.findAll({ where: { accolade_id: accoladeIds } })
      : [];
    const recipientsByAccolade = recipientRows.reduce((acc, row) => {
      const list = acc[row.accolade_id] || (acc[row.accolade_id] = []);
      list.push({
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        syncedAt: row.synced_at
      });
      return acc;
    }, {});

    const result = accolades.map(record => {
      const data = record.get ? record.get({ plain: true }) : record;
      const recipients = recipientsByAccolade[data.id] || [];
      const syncedAt = recipients[0]?.syncedAt || null;
      return { ...data, recipients, syncedAt };
    });

    res.json({ accolades: result });
  } catch (err) {
    console.error('Failed to load accolades:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getAccolade(req, res) {
  const { id } = req.params;
  try {
    const accolade = await Accolade.findByPk(id);
    if (!accolade) return res.status(404).json({ error: 'Not found' });

    const recipients = await AccoladeRecipient.findAll({ where: { accolade_id: accolade.id } });
    const formatted = recipients.map(row => ({
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      syncedAt: row.synced_at
    }));
    const data = accolade.get ? accolade.get({ plain: true }) : accolade;

    res.json({
      accolade: { ...data, recipients: formatted, syncedAt: formatted[0]?.syncedAt || null }
    });
  } catch (err) {
    console.error('Failed to load accolade:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/', listAccolades);
router.get('/:id', getAccolade);

module.exports = { router, listAccolades, getAccolade };
