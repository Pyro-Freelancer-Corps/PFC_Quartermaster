const { VerifiedUser, OrgTag } = require('../../config/database');
const { evaluateAndFixNickname } = require('../../utils/evaluateAndFixNickname');
const { fetchGuildMembers } = require('../../utils/fetchGuildMembers');

/**
 * Sweeps all guild members and enforces nickname formatting.
 *
 * @param {object} client - The Discord.js client instance.
 */
async function sweepVerifiedNicknames(client) {
  console.log('🧽 Sweeping verified nicknames...');
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.warn('⚠️ No guild found in cache. Cannot run sweep.');
    return;
  }

  const [verifiedUsers, orgTags] = await Promise.all([
    VerifiedUser.findAll(),
    OrgTag.findAll(),
  ]);

  const verifiedUsersMap = new Map(verifiedUsers.map(u => [u.discordUserId, u]));
  const knownTags = orgTags.filter(o => o.tag).map(o => o.tag.toUpperCase());

  const members = await fetchGuildMembers(guild);
  if (!members.length) {
    console.warn('⚠️ Unable to fetch members for nickname sweep.');
    return;
  }

  let checked = 0, updated = 0;

  for (const member of members) {
    checked++;
    const updatedNickname = await evaluateAndFixNickname(member, {
      verifiedUsersMap,
      knownTags,
      skipPending: false,
    });

    if (updatedNickname) updated++;
  }
  console.log(`✅ Nickname sweep complete. Checked: ${checked}, Updated: ${updated}`);
}

module.exports = {
  sweepVerifiedNicknames,
};
