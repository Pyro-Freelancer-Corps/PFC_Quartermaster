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
      fetch: jest.fn(),
      cache: { size: 5 }
    }
  });

  beforeEach(() => {
    clearGuildMemberFetchState();
    now = 0;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  test('fetches members once within ttl window', async () => {
    const guild = makeGuild();
    guild.members.fetch.mockResolvedValue('first');

    await ensureGuildMembersFetched(guild, { ttlMs: 1000 });
    expect(guild.members.fetch).toHaveBeenCalledTimes(1);

    now = 500;
    await ensureGuildMembersFetched(guild, { ttlMs: 1000 });
    expect(guild.members.fetch).toHaveBeenCalledTimes(1);

    now = 1500;
    guild.members.fetch.mockResolvedValue('second');
    await ensureGuildMembersFetched(guild, { ttlMs: 1000 });
    expect(guild.members.fetch).toHaveBeenCalledTimes(2);
  });

  test('recovers from GuildMembersTimeout using cached members', async () => {
    const guild = makeGuild();
    const timeoutError = Object.assign(new Error('timed out'), { code: 'GuildMembersTimeout' });
    guild.members.fetch.mockRejectedValueOnce(timeoutError);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await ensureGuildMembersFetched(guild, { failureCooldownMs: 1000 });
    expect(result).toBe(guild.members.cache);
    expect(warnSpy).toHaveBeenCalled();

    guild.members.fetch.mockClear();
    now = 500;
    await ensureGuildMembersFetched(guild, { failureCooldownMs: 1000 });
    expect(guild.members.fetch).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('rethrows non-timeout errors', async () => {
    const guild = makeGuild();
    const err = new Error('boom');
    guild.members.fetch.mockRejectedValueOnce(err);

    await expect(ensureGuildMembersFetched(guild)).rejects.toThrow('boom');
  });
});
