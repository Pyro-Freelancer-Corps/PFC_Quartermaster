# Spam Detection System Setup Guide

## Overview

The PFC Quartermaster bot now includes an automated spam detection system that analyzes messages in real-time and instantly bans spam bots while notifying them via DM with admin contact information.

## Features

- **Pattern-based Detection**: Detects Discord scams, phishing, crypto scams, and promotion spam
- **Behavioral Analysis**: Flags rapid-fire messaging and cross-channel duplicates
- **Link Analysis**: Identifies suspicious URLs and URL shorteners
- **Complete Message Cleanup**: Deletes ALL messages from spam bots across all channels using database logs
- **Ban Notifications**: Sends DM to banned users with appeal instructions and admin contact list
- **Moderator Alerts**: Posts detailed ban notifications to mod log channel

## Configuration

### 1. Set Admin Role IDs

Edit `config.json` and add your admin role IDs:

```json
{
  "adminRoleIds": ["ROLE_ID_1", "ROLE_ID_2", "ROLE_ID_3"],
  "modLogChannelId": "CHANNEL_ID_FOR_MOD_LOGS"
}
```

**Finding Role IDs:**
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click a role → Copy ID

**Finding Channel ID:**
1. Right-click the mod log channel → Copy ID

### 2. Database Migration

The system automatically creates the `spam_detection` table on first run. No manual migration needed.

## Detection Criteria

### Auto-Ban Triggers

A user is **instantly banned** if they trigger any of:

1. **Critical Flags** (any one triggers ban):
   - Spam content patterns (Discord scams, phishing, crypto scams)
   - Suspicious URL patterns (bit.ly, discord.gift, steam gift scams)

2. **Multiple High-Severity Flags** (2+ triggers ban):
   - Rapid-fire messages (3+ in 5 seconds)
   - Cross-channel duplicate messages
   - New account (< 7 days) posting untrusted links

### Spam Patterns Detected

- **Discord Scams**: Free Nitro, Discord gifts, fake Steam Nitro offers
- **Phishing**: "Verify account", "Claim prize", "Selected winner"
- **Crypto Scams**: Airdrops, guaranteed profits, crypto giveaways
- **Adult Spam**: OnlyFans, adult content links
- **Server Promotion**: Unsolicited server invites and DM requests

### Trusted Domains (Not Flagged)

- YouTube, Twitter/X, Twitch
- Roberts Space Industries (RSI), Star Citizen tools
- GitHub, Reddit, Imgur
- Common image/video hosts

## How It Works

### 1. Message Analysis
Every message is analyzed for:
- Content matching spam patterns
- URL extraction and validation
- Behavioral metrics (message frequency, duplicates)
- Account age and join time

### 2. Instant Ban Process
When spam is detected:
1. Query database for ALL user messages
2. Delete all messages across all channels (even old ones)
3. Send DM to user with ban reason and admin contact info
4. Ban user from server (7-day message history cleanup as backup)
5. Log incident to `spam_detection` table
6. Notify moderators in mod log channel with full details

### 3. Message Cleanup
The system uses your `UsageLog` database table to find and delete **every message** from the spam bot, including:
- Messages in any channel
- Messages from any time (not limited to last 7 days)
- Bulk deletion for recent messages (< 14 days)
- Individual deletion for older messages

## Moderator Tools

### Reviewing Bans

Check the mod log channel for automatic ban notifications with:
- User details (tag, ID, account creation date)
- Triggered flags and severity levels
- Message content that triggered the ban
- Timestamp of detection

### False Positive Handling

If a legitimate user is banned:
1. Unban the user via Discord
2. Update the `spam_detection` table:
   ```sql
   UPDATE spam_detection
   SET false_positive = true
   WHERE user_id = 'USER_ID';
   ```
3. Contact the user to apologize and invite them back

### Database Queries

View spam detection logs:
```sql
SELECT * FROM spam_detection
ORDER BY createdAt DESC
LIMIT 20;
```

View false positive rate:
```sql
SELECT
  COUNT(*) as total_bans,
  SUM(false_positive) as false_positives,
  (SUM(false_positive) * 100.0 / COUNT(*)) as false_positive_rate
FROM spam_detection;
```

## Customization

### Adding Spam Patterns

Edit `utils/spamPatterns.js`:

```javascript
const SPAM_PATTERNS = {
  // Add new category
  custom_spam: [
    /your.*pattern/i,
    /another.*pattern/i
  ]
};
```

### Adding Trusted Domains

Edit `utils/spamPatterns.js`:

```javascript
const TRUSTED_DOMAINS = [
  'your-domain.com',
  'trusted-site.org'
];
```

### Adjusting Detection Sensitivity

Edit `utils/messageAnalyzer.js`:

```javascript
// Change rapid-fire threshold
if (recentMessages.length >= 3) // Default: 3 messages in 5 seconds

// Change account age threshold
if (accountAge < 7 * 24 * 60 * 60 * 1000) // Default: 7 days
```

## Testing

Run spam detection tests:
```bash
npm test -- __tests__/utils/messageAnalyzer.test.js
npm test -- __tests__/utils/spamHandler.test.js
```

## Monitoring

### Key Metrics to Track
- Total bans per day/week
- False positive rate
- Most common spam patterns detected
- Message cleanup effectiveness

### Recommended Actions
- Review mod log channel daily
- Check false positive rate weekly
- Update spam patterns as new scams emerge
- Adjust admin role IDs as team changes

## Troubleshooting

### DMs Not Sending
- User has DMs disabled from server members
- User blocked the bot
- This is normal - bot will log the attempt

### Messages Not Deleting
- Check bot has "Manage Messages" permission in all channels
- Verify bot role is high enough in hierarchy
- Check database connection for UsageLog queries

### False Positives
- User posted legitimate link shortly after joining
- User shared multiple messages quickly during conversation
- Review and adjust detection thresholds

## Support

For issues or questions about the spam detection system:
1. Check this guide first
2. Review mod log channel for detailed ban information
3. Query `spam_detection` table for historical data
4. Adjust patterns and thresholds as needed

---

**Last Updated**: System implemented with message pattern analysis, content matching, and database-driven message cleanup.
