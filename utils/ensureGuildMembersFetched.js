const fetchStateByGuild = new Map();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // refresh at most every 5 minutes
const DEFAULT_FAILURE_COOLDOWN_MS = 60 * 1000; // wait 1 minute after a timeout

function getState(guildId) {
  if (!fetchStateByGuild.has(guildId)) {
    fetchStateByGuild.set(guildId, {
      lastSuccess: 0,
      lastFailure: 0,
      inFlight: null
    });
  }
  return fetchStateByGuild.get(guildId);
}

/**
 * Ensures the guild member cache is hydrated while avoiding repeated full fetches.
 * Returns true when members are considered fresh, false when we need to fall back to
 * whatever is cached locally (e.g. after a timeout).
 *
 * @param {Guild} guild - Discord.js Guild instance.
 * @param {{ ttlMs?: number, failureCooldownMs?: number }} options
 * @returns {Promise<boolean>}
 */
async function ensureGuildMembersFetched(guild, options = {}) {
  if (!guild?.id || !guild?.members?.fetch) {
    throw new Error('Invalid guild passed to ensureGuildMembersFetched');
  }

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const failureCooldownMs = options.failureCooldownMs ?? DEFAULT_FAILURE_COOLDOWN_MS;
  const state = getState(guild.id);
  const now = Date.now();

  if (state.inFlight) {
    return state.inFlight;
  }

  const cacheFresh = state.lastSuccess && now - state.lastSuccess < ttlMs;
  if (cacheFresh) {
    return true;
  }

  const withinCooldown = state.lastFailure && now - state.lastFailure < failureCooldownMs;
  if (withinCooldown) {
    return false;
  }

  const fetchPromise = guild.members.fetch()
    .then(() => {
      state.lastSuccess = Date.now();
      state.lastFailure = 0;
      return true;
    })
    .catch(error => {
      state.lastFailure = Date.now();
      if (error?.code === 'GuildMembersTimeout') {
        console.warn(`⚠️ Guild member fetch timed out for guild ${guild.id}; serving cached data.`);
        return false;
      }
      fetchStateByGuild.delete(guild.id);
      throw error;
    })
    .finally(() => {
      state.inFlight = null;
    });

  state.inFlight = fetchPromise;
  return fetchPromise;
}

function clearGuildMemberFetchState(guildId) {
  if (guildId) {
    fetchStateByGuild.delete(guildId);
  } else {
    fetchStateByGuild.clear();
  }
}

module.exports = {
  ensureGuildMembersFetched,
  clearGuildMemberFetchState,
  _fetchStateByGuild: fetchStateByGuild
};
