const express = require('express');
const router = express.Router();
const { OfficerBio } = require('../config/database');
const { getClient } = require('../discordClient');
const config = require('../config.json');
const { PermissionFlagsBits } = require('discord.js');
const { ensureGuildMembersFetched } = require('../utils/ensureGuildMembersFetched');

async function listOfficers(req, res) {
  const client = getClient();
  const guild = client?.guilds?.cache.get(config.guildId);
  if (!client || !guild) {
    console.error('Discord client unavailable for officers endpoint');
    return res.status(500).json({ error: 'Discord client unavailable' });
  }
  try {
    await ensureGuildMembersFetched(guild);
    const officerMembers = guild.members.cache.filter(m => m.permissions.has(PermissionFlagsBits.KickMembers));

    const officers = await Promise.all(officerMembers.map(async m => {
      const kickRole = m.roles.cache
        .filter(r => r.permissions.has(PermissionFlagsBits.KickMembers))
        .sort((a, b) => b.position - a.position)
        .first();
      const bio = await OfficerBio.findByPk(m.id);
      return {
        userId: m.id,
        username: m.user.username,
        displayName: m.displayName,
        roleName: kickRole?.name || null,
        roleColor: kickRole?.hexColor || null,
        bio: bio?.bio || null
      };
    }));

    res.json({ officers });
  } catch (err) {
    console.error('Failed to fetch officers:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/', listOfficers);

module.exports = { router, listOfficers };
