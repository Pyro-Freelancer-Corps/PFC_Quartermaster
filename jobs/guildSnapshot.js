const { syncGuildSnapshot } = require('../botactions/memberSnapshot/syncGuildSnapshot');

function startGuildSnapshotJob(client, intervalMs = 15 * 60 * 1000) {
  if (!client) {
    console.warn('⚠️ Cannot start guild snapshot job without a Discord client.');
    return null;
  }

  let inFlight = false;

  const run = async () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      await syncGuildSnapshot(client);
    } catch (error) {
      console.error('❌ Guild snapshot job failed:', error);
    } finally {
      inFlight = false;
    }
  };

  // Run immediately on startup
  run();
  return setInterval(run, intervalMs);
}

module.exports = { startGuildSnapshotJob };
