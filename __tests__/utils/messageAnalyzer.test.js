jest.mock('../../config/database', () => ({
  VerifiedUser: {
    findOne: jest.fn()
  }
}));

jest.mock('../../config.json', () => ({
  spamDetection: {
    trustedRoles: ['Pyro Freelancer Corps'],
    thresholds: {
      trusted: {
        accountAgeDays: 30,
        joinAgeDays: 7,
        messageCount: 10
      },
      member: {
        accountAgeDays: 7,
        joinAgeHours: 24
      }
    }
  }
}));

const { analyzeMessage, extractUrls, matchesSpamPatterns, getRecentMessages, clearUserTracking, getTrustLevel } = require('../../utils/messageAnalyzer');
const { VerifiedUser } = require('../../config/database');

describe('messageAnalyzer', () => {
  let mockMessage;
  let mockMember;

  beforeEach(() => {
    jest.clearAllMocks();
    clearUserTracking('user1');

    // Mock VerifiedUser.findOne to return null by default
    VerifiedUser.findOne.mockResolvedValue(null);

    mockMember = {
      id: 'user1',
      user: {
        id: 'user1',
        tag: 'TestUser#1234',
        bot: false,
        createdTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 // 2 days old
      },
      joinedTimestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
      roles: {
        cache: []
      }
    };

    mockMessage = {
      content: 'Hello world',
      member: mockMember,
      author: mockMember.user,
      channel: {
        id: 'channel1'
      }
    };
  });

  describe('extractUrls', () => {
    test('extracts single URL from content', () => {
      const urls = extractUrls('Check this out https://example.com');
      expect(urls).toEqual(['https://example.com']);
    });

    test('extracts multiple URLs from content', () => {
      const urls = extractUrls('Visit https://example.com and http://test.com');
      expect(urls).toEqual(['https://example.com', 'http://test.com']);
    });

    test('returns empty array when no URLs present', () => {
      const urls = extractUrls('No links here');
      expect(urls).toEqual([]);
    });
  });

  describe('matchesSpamPatterns', () => {
    test('detects Discord scam pattern', () => {
      const result = matchesSpamPatterns('Free nitro at discord.gift/abc123');
      expect(result.matched).toBe(true);
      expect(result.type).toBe('discord_scam');
    });

    test('detects phishing pattern', () => {
      const result = matchesSpamPatterns('Click here to verify your account');
      expect(result.matched).toBe(true);
      expect(result.type).toBe('phishing');
    });

    test('detects crypto scam pattern', () => {
      const result = matchesSpamPatterns('Free crypto airdrop');
      expect(result.matched).toBe(true);
      expect(result.type).toBe('crypto_scam');
    });

    test('returns false for clean content', () => {
      const result = matchesSpamPatterns('Hello, how are you?');
      expect(result.matched).toBe(false);
      expect(result.type).toBe(null);
    });
  });

  describe('analyzeMessage', () => {
    test('returns not spam for normal message', async () => {
      const result = await analyzeMessage(mockMessage);
      expect(result.isSpam).toBe(false);
      expect(result.flags).toEqual([]);
    });

    test('flags rapid-fire messages', async () => {
      mockMessage.content = 'Message 1';
      await analyzeMessage(mockMessage);

      mockMessage.content = 'Message 2';
      await analyzeMessage(mockMessage);

      mockMessage.content = 'Message 3';
      const result = await analyzeMessage(mockMessage);

      expect(result.flags.some(f => f.type === 'rapid_fire')).toBe(true);
    });

    test('flags spam content patterns but does not auto-ban without other flags', async () => {
      mockMessage.content = 'Free nitro here: discord.gift/test';
      const result = await analyzeMessage(mockMessage);

      expect(result.isSpam).toBe(false); // Spam keywords alone don't trigger ban
      expect(result.flags.some(f => f.type === 'spam_content')).toBe(true);
    });


    test('skips bot messages', async () => {
      mockMember.user.bot = true;
      const result = await analyzeMessage(mockMessage);

      expect(result.isSpam).toBe(false);
      expect(result.flags).toEqual([]);
    });

    test('detects spam with multiple high severity flags', async () => {
      // Rapid fire messages
      await analyzeMessage({ ...mockMessage, content: 'Msg 1' });
      await analyzeMessage({ ...mockMessage, content: 'Msg 2' });

      // Third message with spam content
      mockMessage.content = 'Free Discord nitro here!';
      const result = await analyzeMessage(mockMessage);

      expect(result.isSpam).toBe(true);
      expect(result.flags.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('clearUserTracking', () => {
    test('clears tracking data for user', async () => {
      await analyzeMessage(mockMessage);
      clearUserTracking('user1');

      const messages = getRecentMessages('user1');
      expect(messages).toEqual([]);
    });
  });

  describe('getTrustLevel', () => {
    test('returns "verified" for users in VerifiedUser database', async () => {
      mockMember.user.createdTimestamp = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day old
      mockMember.joinedTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
      mockMember.roles = { cache: [] };

      // Mock database response
      VerifiedUser.findOne.mockResolvedValue({
        discordUserId: 'user1',
        rsiHandle: 'TestUser',
        verifiedAt: new Date()
      });

      const trustLevel = await getTrustLevel(mockMember);
      expect(trustLevel).toBe('verified');
      expect(VerifiedUser.findOne).toHaveBeenCalledWith({
        where: { discordUserId: 'user1' }
      });
    });

    test('returns "verified" for members with verified role', async () => {
      mockMember.user.createdTimestamp = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day old
      mockMember.joinedTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
      mockMember.roles = {
        cache: [
          { name: 'Pyro Freelancer Corps' }
        ]
      };

      const trustLevel = await getTrustLevel(mockMember);
      expect(trustLevel).toBe('verified');
    });

    test('returns "trusted" for established members', async () => {
      mockMember.user.createdTimestamp = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days old
      mockMember.joinedTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days in server
      mockMember.roles = { cache: [] };

      // Simulate 10+ messages
      for (let i = 0; i < 10; i++) {
        await analyzeMessage({ ...mockMessage, content: `Message ${i}` });
      }

      const trustLevel = await getTrustLevel(mockMember);
      expect(trustLevel).toBe('trusted');
    });

    test('returns "member" for accounts over 7 days old', async () => {
      mockMember.user.createdTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days old
      mockMember.joinedTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour in server
      mockMember.roles = { cache: [] };

      const trustLevel = await getTrustLevel(mockMember);
      expect(trustLevel).toBe('member');
    });

    test('returns "new" for fresh accounts', async () => {
      mockMember.user.createdTimestamp = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day old
      mockMember.joinedTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour in server
      mockMember.roles = { cache: [] };

      const trustLevel = await getTrustLevel(mockMember);
      expect(trustLevel).toBe('new');
    });
  });

  describe('Trust-based spam detection', () => {
    test('new users are banned with 2 flags', async () => {
      mockMember.user.createdTimestamp = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day old
      mockMember.joinedTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour
      mockMember.roles = { cache: [] };

      // Rapid fire + spam content = 2 flags
      await analyzeMessage({ ...mockMessage, content: 'Msg 1' });
      await analyzeMessage({ ...mockMessage, content: 'Msg 2' });
      mockMessage.content = 'Free nitro here!';
      const result = await analyzeMessage(mockMessage);

      expect(result.trustLevel).toBe('new');
      expect(result.requiredFlags).toBe(2);
      expect(result.isSpam).toBe(true);
    });

    test('trusted users get timeout with 2 flags', async () => {
      mockMember.user.createdTimestamp = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days old
      mockMember.joinedTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days in server
      mockMember.roles = { cache: [] };

      // Simulate message history
      for (let i = 0; i < 10; i++) {
        await analyzeMessage({ ...mockMessage, content: `History ${i}` });
      }

      // Rapid fire + spam content = 2 flags (triggers timeout for trusted)
      await analyzeMessage({ ...mockMessage, content: 'Msg 1' });
      await analyzeMessage({ ...mockMessage, content: 'Msg 2' });
      mockMessage.content = 'Free nitro here!';
      const result = await analyzeMessage(mockMessage);

      expect(result.trustLevel).toBe('trusted');
      expect(result.requiredFlags).toBe(2);
      expect(result.isSpam).toBe(true);
      expect(result.action).toBe('timeout');
    });

    test('verified users get timeout with 2 flags', async () => {
      mockMember.user.createdTimestamp = Date.now() - 1 * 24 * 60 * 60 * 1000;
      mockMember.joinedTimestamp = Date.now() - 1 * 60 * 60 * 1000;
      mockMember.roles = {
        cache: [{ name: 'Pyro Freelancer Corps' }]
      };

      // 2 flags - triggers timeout for verified (same as trusted)
      await analyzeMessage({ ...mockMessage, content: 'Msg 1' });
      await analyzeMessage({ ...mockMessage, content: 'Msg 2' });
      mockMessage.content = 'Free nitro!';
      const result = await analyzeMessage(mockMessage);

      expect(result.trustLevel).toBe('verified');
      expect(result.requiredFlags).toBe(2);
      expect(result.isSpam).toBe(true);
      expect(result.action).toBe('timeout');
    });
  });
});
