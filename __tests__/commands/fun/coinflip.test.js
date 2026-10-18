const coinflip = require('../../../commands/fun/coinflip');
const { MessageFlags } = require('../../../__mocks__/discord.js');

jest.useFakeTimers();

const makeGuild = (hasTesterRole = false) => {
  const challengerMember = {
    displayName: 'Challenger',
    roles: { cache: { has: jest.fn(() => hasTesterRole) } },
  };
  const opponentMember = {
    displayName: 'Opponent',
    roles: { cache: { has: jest.fn() } },
  };
  return {
    members: {
      fetch: jest.fn(id => (id === 'challenger' ? challengerMember : opponentMember)),
    },
    roles: {
      cache: {
        find: jest.fn(fn => (fn({ name: 'Commodore' }) ? { id: 'fa', name: 'Commodore' } : undefined)),
      },
    },
  };
};

const makeChallengeInteraction = ({ self = false, hasTesterRole = false } = {}) => {
  const user = { id: 'challenger' };
  const opponent = { id: self ? 'challenger' : 'opponent' };
  return {
    user,
    options: {
      getSubcommand: jest.fn(() => 'challenge'),
      getUser: jest.fn(() => opponent),
    },
    guild: makeGuild(hasTesterRole),
    reply: jest.fn(),
  };
};

const makeCallInteraction = (choice, userId = 'opponent') => {
  return {
    user: { id: userId },
    options: {
      getSubcommand: jest.fn(() => 'call'),
      getString: jest.fn(() => choice),
    },
    guild: makeGuild(),
    client: { users: { fetch: jest.fn(() => ({ id: 'challenger' })) } },
    reply: jest.fn(),
  };
};

describe('/coinflip command', () => {
  let originalRandom;
  beforeEach(() => {
    jest.useFakeTimers();
    originalRandom = Math.random;
    Math.random = jest.fn(() => 0); // always heads
  });

  afterEach(() => {
    Math.random = originalRandom;
    jest.useRealTimers();
  });

  test('rejects self challenge without role', async () => {
    const interaction = makeChallengeInteraction({ self: true });
    await coinflip.execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('challenge yourself'),
      flags: MessageFlags.Ephemeral,
    });
  });

  test('handles challenge and call flow', async () => {
    const challenge = makeChallengeInteraction();
    await coinflip.execute(challenge);
    expect(challenge.reply).toHaveBeenCalledWith(expect.stringContaining('has challenged'));

      const call = makeCallInteraction('heads');
    await coinflip.execute(call);
    expect(call.reply.mock.calls[0][0].embeds[0].toJSON().description).toContain('wins the toss');

    // second call after challenge resolved
    call.reply.mockClear();
    await coinflip.execute(call);
    expect(call.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('no pending coin flip'),
      flags: MessageFlags.Ephemeral,
    });
  });

  test('challenge expires after timeout', async () => {
    const challenge = makeChallengeInteraction();
    await coinflip.execute(challenge);
    jest.advanceTimersByTime(2 * 60 * 1000);

    const call = makeCallInteraction('heads', 'challenger');
    await coinflip.execute(call);
    expect(call.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('no pending coin flip'),
      flags: MessageFlags.Ephemeral,
    });
  });

  test('allows self challenge for Commodore role', async () => {
    const challenge = makeChallengeInteraction({ self: true, hasTesterRole: true });
    await coinflip.execute(challenge);
    expect(challenge.reply).toHaveBeenCalledWith(expect.stringContaining('has challenged'));

    const call = makeCallInteraction('heads', 'challenger');
    await coinflip.execute(call);
    expect(call.reply.mock.calls[0][0].embeds[0].toJSON().description).toContain('wins the toss');
  });

  test('rejects challenge when opponent already challenged', async () => {
    const first = makeChallengeInteraction();
    await coinflip.execute(first);

    const second = makeChallengeInteraction();
    await coinflip.execute(second);
    expect(second.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('already has a pending coin flip'),
      flags: MessageFlags.Ephemeral,
    });

    const call = makeCallInteraction('heads');
    await coinflip.execute(call);
  });

  test('handles incorrect call choice', async () => {
    Math.random = jest.fn(() => 1); // always tails

    const challenge = makeChallengeInteraction();
    await coinflip.execute(challenge);

    const call = makeCallInteraction('heads');
    await coinflip.execute(call);
    const result = call.reply.mock.calls[0][0].embeds[0].toJSON();
    expect(result.description).toContain('Challenger');
    expect(result.thumbnail.url).toContain('reverse-650x650.jpg');
  });

  test('ignores unknown subcommand', async () => {
    const interaction = {
      options: { getSubcommand: jest.fn(() => 'other') },
      reply: jest.fn(),
    };
    await coinflip.execute(interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
