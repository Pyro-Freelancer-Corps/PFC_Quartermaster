const { SPAM_PATTERNS, TRUSTED_DOMAINS, SUSPICIOUS_URL_PATTERNS } = require('./spamPatterns');
const { VerifiedUser } = require('../config/database');
const config = require('../config.json');

// In-memory tracking for message patterns (resets on bot restart)
const userMessages = new Map(); // userId -> [{content, timestamp, channelId}]

/**
 * Extract URLs from message content
 * @param {string} content - Message content
 * @returns {string[]} Array of URLs found
 */
function extractUrls(content) {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return content.match(urlRegex) || [];
}

/**
 * Check if a URL is from a trusted domain
 * @param {string} url - URL to check
 * @returns {boolean} True if trusted
 */
function isTrustedDomain(url) {
  try {
    const urlObj = new URL(url);
    return TRUSTED_DOMAINS.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Check if URL matches suspicious patterns
 * @param {string} url - URL to check
 * @returns {boolean} True if suspicious
 */
function isSuspiciousUrl(url) {
  return SUSPICIOUS_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Check if content matches any spam patterns
 * @param {string} content - Message content
 * @returns {{matched: boolean, type: string|null}} Match result
 */
function matchesSpamPatterns(content) {
  for (const [type, patterns] of Object.entries(SPAM_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(content))) {
      return { matched: true, type };
    }
  }
  return { matched: false, type: null };
}

/**
 * Get recent messages from a user
 * @param {string} userId - User ID
 * @param {number} withinMs - Time window in milliseconds
 * @returns {Array} Recent messages
 */
function getRecentMessages(userId, withinMs = 5000) {
  const messages = userMessages.get(userId) || [];
  const cutoff = Date.now() - withinMs;
  return messages.filter(msg => msg.timestamp > cutoff);
}

/**
 * Track a message for pattern analysis
 * @param {string} userId - User ID
 * @param {string} content - Message content
 * @param {string} channelId - Channel ID
 */
function trackMessage(userId, content, channelId) {
  if (!userMessages.has(userId)) {
    userMessages.set(userId, []);
  }

  const messages = userMessages.get(userId);
  messages.push({
    content,
    channelId,
    timestamp: Date.now()
  });

  // Keep only last 10 messages per user to prevent memory bloat
  if (messages.length > 10) {
    messages.shift();
  }

  // Clean up old entries (older than 1 hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  userMessages.forEach((msgs, uid) => {
    const filtered = msgs.filter(m => m.timestamp > oneHourAgo);
    if (filtered.length === 0) {
      userMessages.delete(uid);
    } else {
      userMessages.set(uid, filtered);
    }
  });
}

/**
 * Check if user is sending duplicate messages across channels
 * @param {string} userId - User ID
 * @param {string} content - Message content
 * @returns {boolean} True if duplicate detected
 */
function isDuplicateMessage(userId, content) {
  const messages = userMessages.get(userId) || [];
  const recentMessages = messages.filter(m => Date.now() - m.timestamp < 30000); // 30 seconds

  // Check if same content posted in different channels
  const channels = new Set(recentMessages.map(m => m.channelId));
  const duplicates = recentMessages.filter(m => m.content === content);

  return duplicates.length >= 2 && channels.size >= 2;
}

/**
 * Calculate trust level for a user
 * @param {GuildMember} member - Discord guild member
 * @returns {Promise<string>} Trust level: 'new', 'member', 'trusted', or 'verified'
 */
async function getTrustLevel(member) {
  const accountAge = Date.now() - member.user.createdTimestamp;
  const joinAge = Date.now() - member.joinedTimestamp;
  const messageCount = (userMessages.get(member.id) || []).length;

  // Get config with defaults
  const spamConfig = config.spamDetection || {};
  const trustedRoles = spamConfig.trustedRoles || ['Pyro Freelancer Corps'];
  const thresholds = spamConfig.thresholds || {};

  // Trusted user thresholds (defaults: 30 days account, 7 days in server, 10 messages)
  const trustedThreshold = thresholds.trusted || {};
  const trustedAccountAgeDays = trustedThreshold.accountAgeDays || 30;
  const trustedJoinAgeDays = trustedThreshold.joinAgeDays || 7;
  const trustedMessageCount = trustedThreshold.messageCount || 10;

  // Member thresholds (defaults: 7 days account OR 24 hours in server)
  const memberThreshold = thresholds.member || {};
  const memberAccountAgeDays = memberThreshold.accountAgeDays || 7;
  const memberJoinAgeHours = memberThreshold.joinAgeHours || 24;

  // Check if user has completed /verify command
  try {
    const verifiedUser = await VerifiedUser.findOne({
      where: { discordUserId: member.id }
    });

    if (verifiedUser) {
      return 'verified';
    }
  } catch (error) {
    console.warn('⚠️ Error checking VerifiedUser table:', error.message);
    // Continue with role-based check as fallback
  }

  // Fallback: Check for trusted roles from config
  const hasVerifiedRole = member.roles?.cache?.some(role =>
    trustedRoles.some(trustedRole =>
      role.name.toLowerCase().includes(trustedRole.toLowerCase())
    )
  ) || false;

  if (hasVerifiedRole) {
    return 'verified';
  }

  // Trusted: Based on configured thresholds
  if (accountAge > trustedAccountAgeDays * 24 * 60 * 60 * 1000 &&
      joinAge > trustedJoinAgeDays * 24 * 60 * 60 * 1000 &&
      messageCount >= trustedMessageCount) {
    return 'trusted';
  }

  // Member: Based on configured thresholds
  if (accountAge > memberAccountAgeDays * 24 * 60 * 60 * 1000 ||
      joinAge > memberJoinAgeHours * 60 * 60 * 1000) {
    return 'member';
  }

  // New: Everyone else
  return 'new';
}

/**
 * Analyze a message for spam indicators
 * @param {Message} message - Discord message object
 * @returns {Object} Analysis result with flags
 */
async function analyzeMessage(message) {
  const flags = [];
  const member = message.member;
  const content = message.content;

  if (!member || member.user.bot) {
    return { isSpam: false, flags: [] };
  }

  const accountAge = Date.now() - member.user.createdTimestamp;
  const joinAge = Date.now() - member.joinedTimestamp;
  const messageCount = (userMessages.get(member.id) || []).length;
  const trustLevel = await getTrustLevel(member);

  // Track this message
  trackMessage(member.id, content, message.channel.id);

  // FLAG 1: Rapid-fire messages (3+ in 5 seconds)
  const recentMessages = getRecentMessages(member.id, 5000);
  if (recentMessages.length >= 3) {
    flags.push({
      type: 'rapid_fire',
      severity: 'high',
      detail: `${recentMessages.length} messages in 5 seconds`
    });
  }

  // FLAG 2: Duplicate message across channels
  if (isDuplicateMessage(member.id, content)) {
    flags.push({
      type: 'cross_channel_duplicate',
      severity: 'high',
      detail: 'Same message in multiple channels'
    });
  }

  // FLAG 3: Spam content patterns (only flag if combined with other indicators)
  const spamMatch = matchesSpamPatterns(content);
  if (spamMatch.matched) {
    // Mark as high severity, not critical - requires other flags to trigger ban
    flags.push({
      type: 'spam_content',
      severity: 'high',
      detail: `Matched pattern: ${spamMatch.type}`
    });
  }

  // Determine if this is spam based on flags and trust level
  const highFlags = flags.filter(f => f.severity === 'high');

  // Trust-based thresholds:
  // - verified: Requires 2 flags → timeout (warning, not ban)
  // - trusted: Requires 2 flags → timeout (warning, not ban)
  // - member: Requires 2 flags → ban
  // - new: Requires 2 flags → ban
  let action = 'none';
  let requiredFlags = 2;

  if (trustLevel === 'verified' || trustLevel === 'trusted') {
    requiredFlags = 2;
    if (highFlags.length >= 2) {
      action = 'timeout';
    }
  } else {
    // member or new
    requiredFlags = 2;
    if (highFlags.length >= 2) {
      action = 'ban';
    }
  }

  const isSpam = action !== 'none';

  return {
    isSpam,
    action,
    flags,
    accountAge,
    joinAge,
    messageCount,
    trustLevel,
    requiredFlags
  };
}

/**
 * Clear message tracking for a user (useful after ban)
 * @param {string} userId - User ID
 */
function clearUserTracking(userId) {
  userMessages.delete(userId);
}

module.exports = {
  analyzeMessage,
  clearUserTracking,
  extractUrls,
  matchesSpamPatterns,
  getRecentMessages,
  getTrustLevel
};
