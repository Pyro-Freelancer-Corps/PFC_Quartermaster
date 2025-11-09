const { PermissionFlagsBits } = require('discord.js');
const {
  Accolade,
  AccoladeRecipient,
  OfficerProfile
} = require('../../config/database');

function toArray(collection) {
  if (!collection) {
    return [];
  }
  if (Array.isArray(collection)) {
    return collection;
  }
  if (typeof collection.values === 'function') {
    return Array.from(collection.values());
  }
  return Object.values(collection);
}

async function syncGuildSnapshot(client) {
  const guildId = client?.config?.guildId;
  if (!guildId) {
    console.warn('⚠️ Cannot sync guild snapshot without a configured guildId.');
    return { success: false, reason: 'missingGuildId' };
  }

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(error => {
    console.error('❌ Failed to fetch guild for snapshot sync:', error);
    return null;
  });

  if (!guild) {
    return { success: false, reason: 'guildUnavailable' };
  }

  try {
    await Promise.all([guild.members.fetch(), guild.roles.fetch()]);
  } catch (error) {
    console.error('❌ Failed to hydrate members/roles for snapshot sync:', error);
    return { success: false, reason: 'hydrateFailed' };
  }

  const now = Math.floor(Date.now() / 1000);
  const members = toArray(guild.members.cache);

  const accoladeResult = await snapshotAccolades(members, now);
  const officerResult = await snapshotOfficers(members, now);

  console.log(`✅ Guild snapshot sync complete (accolade rows: ${accoladeResult}, officers: ${officerResult}).`);
  return { success: true, accoladeRows: accoladeResult, officerRows: officerResult };
}

function memberHasRole(member, roleId) {
  if (!roleId) return false;
  const roles = member?.roles?.cache;
  if (!roles) return false;
  if (typeof roles.has === 'function') {
    return roles.has(roleId);
  }
  return toArray(roles).some(role => role?.id === roleId);
}

async function snapshotAccolades(members, syncedAt) {
  const accolades = await Accolade.findAll().catch(error => {
    console.error('❌ Failed to load accolades for snapshot:', error);
    return [];
  });

  if (accolades.length === 0) {
    await AccoladeRecipient.destroy({ where: {} });
    return 0;
  }

  const rows = [];
  for (const accolade of accolades) {
    members
      .filter(member => memberHasRole(member, accolade.role_id))
      .forEach(member => {
        rows.push({
          accolade_id: accolade.id,
          user_id: member.id,
          username: member.user?.username || null,
          display_name: member.displayName || member.user?.globalName || null,
          synced_at: syncedAt
        });
      });
  }

  try {
    await AccoladeRecipient.destroy({ where: {} });
    if (rows.length > 0) {
      await AccoladeRecipient.bulkCreate(rows);
    }
  } catch (error) {
    console.error('❌ Failed to persist accolade recipients snapshot:', error);
    return 0;
  }

  return rows.length;
}

async function snapshotOfficers(members, syncedAt) {
  const officers = members.filter(member => member.permissions?.has?.(PermissionFlagsBits.KickMembers));
  if (officers.length === 0) {
    await OfficerProfile.destroy({ where: {} });
    return 0;
  }

  const rows = officers.map(member => {
    const eligibleRoles = toArray(member.roles?.cache)
      .filter(role => role.permissions?.has?.(PermissionFlagsBits.KickMembers))
      .sort((a, b) => (b?.position || 0) - (a?.position || 0));
    const kickRole = eligibleRoles[0];

    return {
      user_id: member.id,
      username: member.user?.username || null,
      display_name: member.displayName || member.user?.globalName || null,
      role_name: kickRole?.name || null,
      role_color: kickRole?.hexColor || null,
      synced_at: syncedAt
    };
  });

  try {
    await OfficerProfile.destroy({ where: {} });
    if (rows.length > 0) {
      await OfficerProfile.bulkCreate(rows);
    }
  } catch (error) {
    console.error('❌ Failed to persist officer snapshot:', error);
    return 0;
  }

  return rows.length;
}

module.exports = {
  syncGuildSnapshot,
  _private: {
    toArray,
    memberHasRole,
    snapshotAccolades,
    snapshotOfficers
  }
};
