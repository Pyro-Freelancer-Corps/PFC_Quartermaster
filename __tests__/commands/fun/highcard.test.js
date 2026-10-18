const { MessageFlags } = require('../../../__mocks__/discord.js');

let highcard;

const makeGuild = (hasTester = false) => {
  const challengerMember = {
    displayName: 'Challenger',
    roles: { cache: { has: jest.fn(() => hasTester) } },
  };
  const opponentMember = {
    displayName: 'Opponent',
    roles: { cache: { has: jest.fn() } },
  };
  return {
    members: { fetch: jest.fn(id => (id === 'challenger' ? challengerMember : opponentMember)) },
    roles: { cache: { find: jest.fn(fn => (fn({ name: 'Commodore' }) ? { id: 'fa' } : undefined)) } },
  };
};

const makeChallengeInteraction = (self = false, hasTester = false) => ({
  user: { id: 'challenger' },
  options: { getSubcommand: jest.fn(() => 'challenge'), getUser: jest.fn(() => ({ id: self ? 'challenger' : 'opponent' })) },
  guild: makeGuild(hasTester),
  reply: jest.fn(),
  followUp: jest.fn(() => Promise.resolve()),
});

const makeAcceptInteraction = (userId = 'opponent') => ({
  user: { id: userId, tag: 'Opp#1' },
  options: { getSubcommand: jest.fn(() => 'accept') },
  guild: makeGuild(),
  client: { users: { fetch: jest.fn(() => ({ id: 'challenger' })) } },
  reply: jest.fn(),
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  highcard = require('../../../commands/fun/highcard');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('rejects self challenge without role', async () => {
  const interaction = makeChallengeInteraction(true);
  await highcard.execute(interaction);
  expect(interaction.reply).toHaveBeenCalledWith({
    content: expect.stringContaining('challenge yourself'),
    flags: MessageFlags.Ephemeral,
  });
});

test('challenge then accept resolves duel', async () => {
  const challenge = makeChallengeInteraction();
  await highcard.execute(challenge);
  expect(challenge.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('has challenged') }));

  const accept = makeAcceptInteraction();
  jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
  await highcard.execute(accept);
  Math.random.mockRestore();

  expect(accept.reply).toHaveBeenCalled();
  const text = accept.reply.mock.calls[0][0].content;
  expect(text).toContain('High Card Duel Result');
});

test('accept with no challenge', async () => {
  const accept = makeAcceptInteraction();
  await highcard.execute(accept);
  expect(accept.reply).toHaveBeenCalledWith({
    content: expect.stringContaining('no pending challenges'),
    flags: MessageFlags.Ephemeral,
  });
});

test('rejects challenge when opponent already challenged', async () => {
  const first = makeChallengeInteraction();
  await highcard.execute(first);

  const second = makeChallengeInteraction();
  await highcard.execute(second);
  expect(second.reply).toHaveBeenCalledWith({
    content: expect.stringContaining('already has a pending challenge'),
    flags: MessageFlags.Ephemeral,
  });
});

test('challenge times out if not accepted', async () => {
  const challenge = makeChallengeInteraction();
  await highcard.execute(challenge);

  jest.runAllTimers();
  expect(challenge.followUp).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.stringContaining('timed out')
  }));
});

test('accepting draws resulting in a tie sends tie message', async () => {
  const challenge = makeChallengeInteraction();
  await highcard.execute(challenge);

  const accept = makeAcceptInteraction();
  jest
    .spyOn(Math, 'random')
    .mockReturnValueOnce(0) // pick 2 of Spades
    .mockReturnValueOnce(12 / 51); // pick 2 of Hearts after splice

  await highcard.execute(accept);
  Math.random.mockRestore();

  expect(accept.reply).toHaveBeenCalled();
  expect(accept.reply.mock.calls[0][0].content).toContain("It's a tie! Both drew");
});

test('challenger wins when drawing higher card', async () => {
  const challenge = makeChallengeInteraction();
  await highcard.execute(challenge);

  const accept = makeAcceptInteraction();
  jest
    .spyOn(Math, 'random')
    .mockReturnValueOnce(12 / 52) // challenger draws Ace of Spades
    .mockReturnValueOnce(0); // opponent draws 3 of Spades after splice

  await highcard.execute(accept);
  Math.random.mockRestore();

  expect(accept.reply).toHaveBeenCalled();
  expect(accept.reply.mock.calls[0][0].content).toContain('wins with');
});

