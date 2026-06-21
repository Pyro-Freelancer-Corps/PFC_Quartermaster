const { EmbedBuilder } = require('discord.js');
const { clearUserTracking } = require('./messageAnalyzer');
const { UsageLog } = require('../config/database');
const config = require('../config.json');

/**
 * Get list of admin users from the guild
 * @param {Guild} guild - Discord guild
 * @returns {Promise<Array>} Array of admin members
 */
async function getAdminList(guild) {
  try {
    // Get admin role IDs from config
    const adminRoleIds = config.adminRoleIds || [];

    // Fetch all members with admin roles
    const members = await guild.members.fetch();
    const admins = members.filter(member =>
      member.roles.cache.some(role => adminRoleIds.includes(role.id)) ||
      member.permissions.has('Administrator')
    );

    return Array.from(admins.values());
  } catch (error) {
    console.error('❌ Error fetching admin list:', error);
    return [];
  }
}

/**
 * Format admin list for display
 * @param {Array} admins - Array of admin members
 * @returns {string} Formatted admin list
 */
function formatAdminList(admins) {
  if (admins.length === 0) {
    return 'Please contact a server administrator.';
  }

  const adminNames = admins.map(admin => `• ${admin.user.tag}`).join('\n');
  return `You can contact any of the following administrators:\n${adminNames}`;
}

/**
 * Send DM to banned user with appeal information
 * @param {User} user - Discord user who was banned
 * @param {Guild} guild - Guild they were banned from
 * @param {Array} flags - Spam detection flags
 * @returns {Promise<boolean>} True if DM was sent successfully
 */
async function sendBanNotificationDM(user, guild, flags) {
  try {
    const admins = await getAdminList(guild);
    const adminList = formatAdminList(admins);

    const flagDescriptions = flags.map(f => `• ${f.type}: ${f.detail}`).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚫 Automatic Ban Notification')
      .setDescription(`You have been automatically banned from **${guild.name}** due to detected spam activity.`)
      .addFields(
        {
          name: '⚠️ Reason',
          value: 'Your message triggered our automated spam detection system.',
          inline: false
        },
        {
          name: '🔍 Detection Details',
          value: flagDescriptions || 'Spam patterns detected',
          inline: false
        },
        {
          name: '📩 Appeal Process',
          value: 'If you believe this ban was made in error, you can appeal by contacting a server administrator.',
          inline: false
        },
        {
          name: '👥 Contact',
          value: adminList,
          inline: false
        }
      )
      .setFooter({ text: 'This is an automated message from the PFC Quartermaster bot' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    console.log(`✅ Ban notification DM sent to ${user.tag}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Could not send DM to ${user.tag}:`, error.message);
    return false;
  }
}

/**
 * Log spam detection to database
 * @param {Object} SpamDetection - Sequelize model
 * @param {User} user - Discord user
 * @param {Member} member - Guild member
 * @param {string} messageContent - Message content
 * @param {Array} flags - Detection flags
 * @param {string} actionTaken - Action taken (deleted, banned)
 * @returns {Promise<void>}
 */
async function logSpamDetection(SpamDetection, user, member, messageContent, flags, actionTaken) {
  try {
    const banReason = flags.map(f => `${f.type} (${f.severity})`).join(', ');

    await SpamDetection.upsert({
      user_id: user.id,
      username: user.tag,
      account_created_at: new Date(user.createdTimestamp),
      joined_at: new Date(member.joinedTimestamp),
      first_message_content: messageContent.substring(0, 500), // Limit to 500 chars
      flags: flags,
      message_count: 1,
      last_message_at: new Date(),
      action_taken: actionTaken,
      ban_reason: banReason,
      false_positive: false
    });

    console.log(`📊 Spam detection logged for ${user.tag}`);
  } catch (error) {
    console.error('❌ Error logging spam detection:', error);
  }
}

/**
 * Notify moderators of automatic ban
 * @param {Guild} guild - Discord guild
 * @param {User} user - Banned user
 * @param {Array} flags - Detection flags
 * @param {string} messageContent - Message content that triggered ban
 * @returns {Promise<void>}
 */
async function notifyModerators(guild, user, flags, messageContent) {
  try {
    const modLogChannelId = config.modLogChannelId;
    if (!modLogChannelId) return;

    const channel = await guild.channels.fetch(modLogChannelId);
    if (!channel) return;

    const flagDescriptions = flags.map(f => `• **${f.type}** (${f.severity}): ${f.detail}`).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#FF6B00')
      .setTitle('🤖 Automatic Spam Ban')
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        {
          name: '👤 User',
          value: `${user.tag} (${user.id})`,
          inline: true
        },
        {
          name: '📅 Account Created',
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
          inline: true
        },
        {
          name: '🚩 Flags Triggered',
          value: flagDescriptions,
          inline: false
        },
        {
          name: '💬 Message Content',
          value: messageContent.substring(0, 1000) || 'No content',
          inline: false
        },
        {
          name: '⚙️ Action',
          value: 'User banned automatically. Review and mark as false positive if needed using `/unban`.',
          inline: false
        }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`📢 Moderators notified of ban for ${user.tag}`);
  } catch (error) {
    console.error('❌ Error notifying moderators:', error);
  }
}

/**
 * Delete all messages from a user using database logs
 * @param {Guild} guild - Discord guild
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of messages deleted
 */
async function deleteAllUserMessages(guild, userId) {
  let deletedCount = 0;
  let failedCount = 0;

  try {
    // Query database for all messages from this user
    const userMessages = await UsageLog.findAll({
      where: {
        user_id: userId,
        interaction_type: 'message',
        event_type: 'message_create',
        server_id: guild.id
      },
      order: [['event_time', 'DESC']]
    });

    console.log(`📊 Found ${userMessages.length} messages from ${userId} in database logs`);

    // Group messages by channel for efficient deletion
    const messagesByChannel = new Map();
    for (const log of userMessages) {
      if (!messagesByChannel.has(log.channel_id)) {
        messagesByChannel.set(log.channel_id, []);
      }
      messagesByChannel.get(log.channel_id).push(log.message_id);
    }

    // Delete messages from each channel
    for (const [channelId, messageIds] of messagesByChannel) {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased?.()) {
          console.warn(`⚠️ Channel ${channelId} not found or not text-based`);
          continue;
        }

        console.log(`🔍 Deleting ${messageIds.length} messages from #${channel.name}`);

        // Fetch messages to determine age for bulk delete
        const messagesToDelete = [];
        for (const messageId of messageIds) {
          try {
            const msg = await channel.messages.fetch(messageId);
            if (msg) {
              messagesToDelete.push(msg);
            }
          } catch (fetchError) {
            // Message might already be deleted
            failedCount++;
          }
        }

        // Bulk delete messages less than 14 days old
        const now = Date.now();
        const bulkDeletable = messagesToDelete.filter(
          msg => now - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000
        );

        if (bulkDeletable.length > 1) {
          await channel.bulkDelete(bulkDeletable, true);
          deletedCount += bulkDeletable.length;
          console.log(`🧹 Bulk deleted ${bulkDeletable.length} messages from #${channel.name}`);
        } else if (bulkDeletable.length === 1) {
          await bulkDeletable[0].delete();
          deletedCount++;
        }

        // Delete older messages individually
        const oldMessages = messagesToDelete.filter(
          msg => now - msg.createdTimestamp >= 14 * 24 * 60 * 60 * 1000
        );

        for (const msg of oldMessages) {
          try {
            await msg.delete();
            deletedCount++;
          } catch (deleteError) {
            failedCount++;
            console.warn(`⚠️ Could not delete old message:`, deleteError.message);
          }
        }

      } catch (channelError) {
        console.warn(`⚠️ Error processing channel ${channelId}:`, channelError.message);
        failedCount += messagesByChannel.get(channelId).length;
      }
    }

    console.log(`✅ Deleted ${deletedCount} messages from spam bot (${failedCount} failed/already deleted)`);
    return deletedCount;
  } catch (error) {
    console.error('❌ Error in deleteAllUserMessages:', error);
    return deletedCount;
  }
}

/**
 * Handle detected spam by banning user and sending notifications
 * @param {Message} message - Discord message object
 * @param {Object} analysis - Analysis result from messageAnalyzer
 * @param {Object} SpamDetection - Sequelize model
 * @returns {Promise<void>}
 */
async function handleSpam(message, analysis, SpamDetection) {
  const { member, author, guild, content } = message;
  const { flags } = analysis;

  console.log(`🚨 Spam detected from ${author.tag}: ${flags.map(f => f.type).join(', ')}`);

  try {
    // First, delete ALL messages from this user across all channels
    const deletedCount = await deleteAllUserMessages(guild, author.id);
    console.log(`🧹 Cleaned up ${deletedCount} spam messages across all channels`);

    // Send DM before banning (so they can receive it)
    await sendBanNotificationDM(author, guild, flags);

    // Ban the user (with deleteMessageSeconds as backup for any missed messages)
    const banReason = `Automatic spam detection: ${flags.map(f => f.type).join(', ')}`;
    await guild.members.ban(author.id, {
      reason: banReason,
      deleteMessageSeconds: 604800 // Delete messages from last 7 days (Discord maximum)
    });
    console.log(`🔨 Banned ${author.tag} for spam`);

    // Log to database
    await logSpamDetection(SpamDetection, author, member, content, flags, 'banned');

    // Notify moderators
    await notifyModerators(guild, author, flags, content);

    // Clear message tracking
    clearUserTracking(author.id);

  } catch (error) {
    console.error(`❌ Error handling spam from ${author.tag}:`, error);
  }
}

module.exports = {
  handleSpam,
  sendBanNotificationDM,
  logSpamDetection,
  notifyModerators,
  getAdminList,
  formatAdminList,
  deleteAllUserMessages
};
