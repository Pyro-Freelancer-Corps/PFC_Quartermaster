const {
  ensureGuildMembersFetched,
  clearGuildMemberFetchState
} = require('../../utils/ensureGuildMembersFetched');

describe('ensureGuildMembersFetched', () => {
  let nowSpy;
  let now;

  const makeGuild = () => ({
    id: 'g1',
    members: {
      fetch: jest.fn()
    }
  });

  beforeEach(() => {
    clearGuildMemberFetchState();
    now = 1;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  test('fetches members once within ttl window', async () => {
    const guild = makeGuild();
    guild.members.fetch.mockResolvedValue();

    const first = await ensureGuildMembersFetched(guild, { ttlMs: 1000 });
    expect(first).toBe(true);
    expect(guild.members.fetch).toHaveBeenCalledTimes(1);

    now = 500;
    const second = await ensureGuildMembersFetched(guild, { ttlMs: 1000 });
    expect(second).toBe(true);
    expect(guild.members.fetch).toHaveBeenCalledTimes(1);

    now = 1500;
    await ensureGuildMembersFetched(guild, { ttlMs: 1000 });
    expect(guild.members.fetch).toHaveBeenCalledTimes(2);
  });

  test('returns false after timeout and throttles retries', async () => {
    const guild = makeGuild();
    const timeoutError = Object.assign(new Error('timed out'), { code: 'GuildMembersTimeout' });
    guild.members.fetch.mockRejectedValue(timeoutError);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await ensureGuildMembersFetched(guild, { failureCooldownMs: 1000 });
    expect(result).toBe(false);
    expect(guild.members.fetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    now = 500;
    const cached = await ensureGuildMembersFetched(guild, { failureCooldownMs: 1000 });
    expect(cached).toBe(false);
    expect(guild.members.fetch).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test('retries after cooldown and succeeds', async () => {
    const guild = makeGuild();
    const timeoutError = Object.assign(new Error('timed out'), { code: 'GuildMembersTimeout' });
    guild.members.fetch
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const first = await ensureGuildMembersFetched(guild, { ttlMs: 1000, failureCooldownMs: 500 });
    expect(first).toBe(false);
    now = 600;
    const second = await ensureGuildMembersFetched(guild, { ttlMs: 1000, failureCooldownMs: 500 });
    expect(second).toBe(true);
    expect(guild.members.fetch).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  test('rethrows non-timeout errors', async () => {
    const guild = makeGuild();
    const err = new Error('boom');
    guild.members.fetch.mockRejectedValueOnce(err);

    await expect(ensureGuildMembersFetched(guild)).rejects.toThrow('boom');
  });
});
