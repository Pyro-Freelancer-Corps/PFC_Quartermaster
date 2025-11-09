const express = require('express');
const router = express.Router();
const { Accolade } = require('../config/database');
const { getClient } = require('../discordClient');
const config = require('../config.json');
const { ensureGuildMembersFetched } = require('../utils/ensureGuildMembersFetched');

async function listAccolades(req, res) {
  try {
    const accolades = await Accolade.findAll();
    const client = getClient();
    const guild = client?.guilds?.cache.get(config.guildId);
    if (!client || !guild) {
      console.error('Discord client unavailable for accolades endpoint');
      return res.status(500).json({ error: 'Discord client unavailable' });
    }
    await ensureGuildMembersFetched(guild);
    const result = accolades.map(a => {
      const data = a.get ? a.get({ plain: true }) : a;
      const members = guild.members.cache
        .filter(m => m.roles.cache.some(r => r.id === data.role_id))
        .map(m => ({ id: m.id, displayName: m.displayName }));
      return { ...data, recipients: members };
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
    const client = getClient();
    const guild = client?.guilds?.cache.get(config.guildId);
    if (!client || !guild) {
      console.error('Discord client unavailable for accolades endpoint');
      return res.status(500).json({ error: 'Discord client unavailable' });
    }
    await ensureGuildMembersFetched(guild);
    const data = accolade.get ? accolade.get({ plain: true }) : accolade;
    const members = guild.members.cache
      .filter(m => m.roles.cache.some(r => r.id === data.role_id))
      .map(m => ({ id: m.id, displayName: m.displayName }));
    res.json({ accolade: { ...data, recipients: members } });
  } catch (err) {
    console.error('Failed to load accolade:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/', listAccolades);
router.get('/:id', getAccolade);

module.exports = { router, listAccolades, getAccolade };
