const fetchStateByGuild = new Map();

const DEFAULT_TTL_MS = 60 * 1000; // refresh member cache at most once per minute
const DEFAULT_FAILURE_COOLDOWN_MS = 15 * 1000; // avoid hammering API after a timeout

function getState(guildId) {
  return fetchStateByGuild.get(guildId) || {};
}

function setState(guildId, nextState) {
  fetchStateByGuild.set(guildId, nextState);
}

/**
 * Ensures the guild member cache is hydrated while avoiding repeated full fetches.
 * It also degrades gracefully when Discord times out by reusing whatever is cached.
 *
 * @param {Guild} guild - Discord.js Guild instance.
 * @param {{ ttlMs?: number, failureCooldownMs?: number }} options
 */
async function ensureGuildMembersFetched(guild, options = {}) {
  if (!guild?.id || !guild?.members?.fetch) {
    throw new Error('Invalid guild passed to ensureGuildMembersFetched');
  }

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const failureCooldownMs = options.failureCooldownMs ?? DEFAULT_FAILURE_COOLDOWN_MS;
  const now = Date.now();
  const state = getState(guild.id);

  if (state.inFlight) {
    return state.inFlight;
  }

  if (typeof state.lastSuccess === 'number' && now - state.lastSuccess < ttlMs) {
    return state.lastResult;
  }

  if (typeof state.lastFailure === 'number' && now - state.lastFailure < failureCooldownMs) {
    return state.lastResult ?? guild.members.cache;
  }

  const fetchPromise = Promise.resolve(guild.members.fetch()).then(result => {
    setState(guild.id, {
      lastSuccess: Date.now(),
      lastResult: result,
      lastFailure: null,
      inFlight: null
    });
    return result;
  }).catch(err => {
    if (err?.code === 'GuildMembersTimeout') {
      const fallback = state.lastResult ?? guild.members.cache;
      if (!state.lastFailure || now - state.lastFailure > failureCooldownMs) {
        console.warn('�s��,? Guild member fetch timed out for guild', guild.id, '- using cached members');
      }
      setState(guild.id, {
        ...state,
        lastFailure: Date.now(),
        lastResult: fallback,
        inFlight: null
      });
      return fallback;
    }

    fetchStateByGuild.delete(guild.id);
    throw err;
  }).finally(() => {
    const latest = getState(guild.id);
    if (latest) {
      latest.inFlight = null;
      setState(guild.id, latest);
    }
  });

  setState(guild.id, { ...state, inFlight: fetchPromise });
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
