const { analyzeMessage, extractUrls, matchesSpamPatterns, getRecentMessages, clearUserTracking } = require('../../utils/messageAnalyzer');

describe('messageAnalyzer', () => {
  let mockMessage;
  let mockMember;

  beforeEach(() => {
    jest.clearAllMocks();
    clearUserTracking('user1');

    mockMember = {
      id: 'user1',
      user: {
        id: 'user1',
        tag: 'TestUser#1234',
        bot: false,
        createdTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 // 2 days old
      },
      joinedTimestamp: Date.now() - 1 * 60 * 60 * 1000 // 1 hour ago
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

    test('flags spam content patterns', async () => {
      mockMessage.content = 'Free nitro here: discord.gift/test';
      const result = await analyzeMessage(mockMessage);

      expect(result.isSpam).toBe(true);
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
});
