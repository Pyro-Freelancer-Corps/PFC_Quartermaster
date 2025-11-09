const express = require('express');
const router = express.Router();
const { OfficerBio, OfficerProfile } = require('../config/database');

async function listOfficers(req, res) {
  try {
    const profiles = await OfficerProfile.findAll();
    const officerIds = profiles.map(profile => profile.user_id);
    const bioRecords = officerIds.length
      ? await OfficerBio.findAll({ where: { discordUserId: officerIds } })
      : [];
    const biosById = bioRecords.reduce((acc, record) => {
      const key = record.discordUserId || record.discord_user_id;
      acc[key] = record.bio;
      return acc;
    }, {});

    const officers = profiles.map(profile => {
      const data = profile.get ? profile.get({ plain: true }) : profile;
      return {
        userId: data.user_id,
        username: data.username,
        displayName: data.display_name,
        roleName: data.role_name,
        roleColor: data.role_color,
        bio: biosById[data.user_id] || null,
        syncedAt: data.synced_at
      };
    }).sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0) || a.displayName?.localeCompare(b.displayName || '') || 0);

    const lastSyncedAt = officers.reduce((max, officer) => Math.max(max, officer.syncedAt || 0), 0) || null;

    res.json({ officers, syncedAt: lastSyncedAt, stale: officers.length === 0 });
  } catch (err) {
    console.error('Failed to fetch officers:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/', listOfficers);

module.exports = { router, listOfficers };
