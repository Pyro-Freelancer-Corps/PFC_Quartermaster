let instrumented = false;

/**
 * Monkey-patch GuildMemberManager#fetch to emit detailed logging so we can
 * see who is calling it, with what parameters, and how long it takes.
 * Only runs when ENABLE_MEMBER_FETCH_DEBUG=1 to avoid noisy logs in prod.
 */
function enableMemberFetchDebugging() {
  if (instrumented || process.env.ENABLE_MEMBER_FETCH_DEBUG !== '1') {
    return;
  }

  try {
    const { GuildMemberManager } = require('discord.js');
    const originalFetch = GuildMemberManager.prototype.fetch;

    GuildMemberManager.prototype.fetch = async function patchedFetch(...args) {
      const guild = this.guild;
      const label = guild ? `${guild.name} (${guild.id})` : 'unknown guild';
      const param = args[0];
      const paramSummary = typeof param === 'object' ? JSON.stringify(param) : param ?? '';
      const start = Date.now();
      console.log(`dY"> Member fetch start -> ${label} params=${paramSummary}`);
      try {
        const result = await originalFetch.apply(this, args);
        const duration = Date.now() - start;
        const size = result?.size ?? result?.length ?? 'n/a';
        console.log(`✅ Member fetch success <- ${label} duration=${duration}ms size=${size}`);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        console.error(`❌ Member fetch failed <- ${label} duration=${duration}ms`, error);
        throw error;
      }
    };

    instrumented = true;
    console.log('dY"> Member fetch debugging enabled (ENABLE_MEMBER_FETCH_DEBUG=1).');
  } catch (error) {
    console.warn('⚠️ Unable to enable member fetch debugging:', error);
  }
}

module.exports = { enableMemberFetchDebugging };
