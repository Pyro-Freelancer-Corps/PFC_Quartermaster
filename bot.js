// 📦 Imports and Setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { initClient } = require('./botactions/initClient');
const { interactionHandler, handleMessageCreate, handleMessageDelete, handleMessageUpdate, handleReactionAdd, handleReactionRemove, handleVoiceStateUpdate, handleGuildMemberRemove, handleGuildBanAdd, handleGuildMemberUpdate } = require('./botactions/eventHandling');
const { registerChannels } = require('./botactions/channelManagement');
const { registerCommands } = require('./utils/commandRegistration');
const { initializeDatabase } = require('./config/database');
const { loadConfiguration } = require('./botactions/configLoader');
const { startScheduledAnnouncementEngine } = require('./botactions/scheduling');
const { getInactiveUsersWithSingleRole, handleRoleAssignment, enforceNicknameFormat, sweepVerifiedNicknames } = require('./botactions/userManagement');
const { handleCreateEvent, handleUpdateEvent, handleDeleteEvent, syncEventsInDatabase } = require('./botactions/eventHandling/scheduledEvents');
const { startAmbientEngine } = require('./botactions/ambient/ambientEngine');
const { deleteOldLogs } = require('./botactions/maintenance/logCleanup');
const { handleMemberJoin } = require('./botactions/eventHandling/memberJoinEvent');
const { startOrgTagSyncScheduler } = require('./botactions/orgTagSync/syncScheduler');
const { startAllScheduledJobs } = require('./jobs');
const { pendingLogs } = require('./jobs/logState')
const { startApi } = require('./api/server');
const { setClient } = require('./discordClient');
const { refreshAccoladeEmbeds } = require('./botactions/accolades');
const { enableMemberFetchDebugging } = require('./utils/instrumentMemberFetch');

enableMemberFetchDebugging();

const botType = process.env.BOT_TYPE;


// 🗂️ Setup Logging Directory
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const now = new Date();
const pad = (n) => n.toString().padStart(2, '0');
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

const logFileName = `bot-${timestamp}.log`;
const logFilePath = path.join(logDir, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const origConsoleError = console.error;
const origConsoleLog = console.log;

const getTimeStampedLine = () => `[${new Date().toISOString()}]`;

console.error = (...args) => {
  const message = `${getTimeStampedLine()} [ERROR] ` + args.join(' ');
  logStream.write(message + '\n');
  sendToDiscordLogChannel(message);
  origConsoleError(...args);
};

console.warn = (...args) => {
  const message = `${getTimeStampedLine()} [WARN] ` + args.join(' ');
  logStream.write(message + '\n');
  sendToDiscordLogChannel(message);
  origConsoleError(...args);
};

console.log = (...args) => {
  const message = `${getTimeStampedLine()} [LOG] ` + args.join(' ');
  logStream.write(message + '\n');
  sendToDiscordLogChannel(message);
  origConsoleLog(...args);
};



// setInterval(flushLogs, 2000);

async function sendToDiscordLogChannel(content) {
  pendingLogs.push(content);
}

// Clean up old logs immediately on startup
deleteOldLogs(logDir, 7);

process.on('exit', () => logStream.end());
process.on('SIGINT', () => {
  console.log('🛑 Caught SIGINT, shutting down cleanly...');
  logStream.end(() => process.exit());
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function safeLogin(client, token, retries = 5) {
  try {
    await client.login(token);
  } catch (error) {
    console.error('❌ Failed to login:', error);
    if (retries > 0) {
      console.log(`🔁 Retrying login in 5 seconds... (${5 - retries + 1}/5)`);
      setTimeout(() => safeLogin(client, token, retries - 1), 5000);
    } else {
      console.error('❌ Max login attempts reached. Exiting.');
      process.exit(1);
    }
  }
}

// 🚀 Bot Initialization Flow
const initializeBot = async () => {
  const config = await loadConfiguration(botType);
  const token = config.token;
  if (!token) {
    console.error('❌ No token found in configuration.');
    return;
  }

  const client = initClient();
  setClient(client);
  client.config = config;

  client.on('interactionCreate', async interaction => {
    await interactionHandler.handleInteraction(interaction, client);
  });
  client.on('messageCreate', message => handleMessageCreate(message, client));
  client.on('messageDelete', message => handleMessageDelete(message));
  client.on('messageUpdate', (oldMessage, newMessage) => handleMessageUpdate(oldMessage, newMessage));
  client.on('messageReactionAdd', (reaction, user) => handleReactionAdd(reaction, user));
  client.on('messageReactionRemove', (reaction, user) => handleReactionRemove(reaction, user));
  client.on('voiceStateUpdate', (oldState, newState) => handleVoiceStateUpdate(oldState, newState, client));
  client.on('guildMemberRemove', member => handleGuildMemberRemove(member));
  client.on('guildBanAdd', ban => handleGuildBanAdd(ban));
  client.on('guildScheduledEventCreate', async event => handleCreateEvent(event, client));
  client.on('guildScheduledEventUpdate', async (oldEvent, newEvent) => handleUpdateEvent(oldEvent, newEvent, client));
  client.on('guildScheduledEventDelete', async event => handleDeleteEvent(event, client));
  client.on('guildMemberAdd', async member => handleMemberJoin(member));

  client.on('error', error => {
    console.error('💥 Client error event:', error);
  });

  client.on('userUpdate', (oldUser, newUser) => {
    console.log(`🔄 A user's profile was updated.`);
  });

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    await handleRoleAssignment(oldMember, newMember, client);
    await enforceNicknameFormat(oldMember, newMember);
    await handleGuildMemberUpdate(oldMember, newMember);
  });

  client.once('ready', async () => {
    console.log('🟢 Discord client is ready!');
    try {
      await initializeDatabase();

      await registerChannels(client);

      await registerCommands(client);

      await getInactiveUsersWithSingleRole(client);

      await syncEventsInDatabase(client);

      await sweepVerifiedNicknames(client);

      await refreshAccoladeEmbeds(client);

      startAmbientEngine(client);

      startScheduledAnnouncementEngine(client);

      startOrgTagSyncScheduler(client);

      console.log('🚀 Bot setup complete and ready to go!');

      startAllScheduledJobs(client);

    } catch (error) {
      console.error('❗ Error during bot setup:', error);
    }
  });

  try {
    await safeLogin(client, token);
  } catch (error) {
    console.error('❌ Failed to login:', error);
  }
};

if (require.main === module) {
  startApi();
  initializeBot();
}

module.exports = {
  safeLogin,
  sendToDiscordLogChannel,
  initializeBot
};
