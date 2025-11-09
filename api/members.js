const express = require('express');
const router = express.Router();
const { getClient } = require('../discordClient');
const config = require('../config.json');
const { ensureGuildMembersFetched } = require('../utils/ensureGuildMembersFetched');

async function listMembers(req, res) {
  const client = getClient();
  const guild = client?.guilds?.cache.get(config.guildId);
  if (!client || !guild) {
    console.error('Discord client unavailable for members endpoint');
    return res.status(500).json({ error: 'Discord client unavailable' });
  }
  try {
    await ensureGuildMembersFetched(guild);
    const members = guild.members.cache.map(m => ({
      userId: m.id,
      username: m.user.username,
      displayName: m.displayName
    }));
    res.json({ members });
  } catch (err) {
    console.error('Failed to fetch members:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/', listMembers);

module.exports = { router, listMembers };
