require('dotenv').config();

const { loadConfiguration } = require('../botactions/configLoader');
const { initClient } = require('../botactions/initClient');
const { syncGuildSnapshot } = require('../botactions/memberSnapshot/syncGuildSnapshot');
const { setClient } = require('../discordClient');

async function run() {
  const botType = process.env.BOT_TYPE || 'development';
  const config = await loadConfiguration(botType);
  if (!config?.token) {
    console.error('❌ No token found for guild snapshot run.');
    process.exit(1);
  }

  const client = initClient();
  setClient(client);
  client.config = config;

  return new Promise((resolve) => {
    client.once('ready', async () => {
      console.log('🌐 Discord client ready. Running guild snapshot...');
      try {
        const result = await syncGuildSnapshot(client);
        console.log('✅ Snapshot complete:', result);
        resolve(result.success ? 0 : 1);
      } catch (error) {
        console.error('❌ Snapshot failed:', error);
        resolve(1);
      } finally {
        client.destroy();
      }
    });

    client.on('error', err => {
      console.error('❌ Discord client error:', err);
    });

    client.login(config.token).catch(err => {
      console.error('❌ Failed to login:', err);
      resolve(1);
    });
  });
}

run().then(code => process.exit(code));
