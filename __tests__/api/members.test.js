jest.mock('../../discordClient', () => ({ getClient: jest.fn() }));
jest.mock('../../config.json', () => ({ guildId: 'g1' }), { virtual: true });
jest.mock('../../utils/ensureGuildMembersFetched', () => ({
  ensureGuildMembersFetched: jest.fn().mockResolvedValue()
}));

const { listMembers } = require('../../api/members');
const { getClient } = require('../../discordClient');
const { ensureGuildMembersFetched } = require('../../utils/ensureGuildMembersFetched');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

const makeCollection = arr => ({ map: fn => arr.map(fn) });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('api/members listMembers', () => {
  test('returns members', async () => {
    const members = [
      { id: '1', user: { username: 'A' }, displayName: 'A' },
      { id: '2', user: { username: 'B' }, displayName: 'B' }
    ];
    const guild = {
      members: { cache: makeCollection(members) }
    };
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => guild) } } });
    const req = {};
    const res = mockRes();

    await listMembers(req, res);

    expect(ensureGuildMembersFetched).toHaveBeenCalledWith(guild);
    expect(res.json).toHaveBeenCalledWith({ members: [
      { userId: '1', username: 'A', displayName: 'A' },
      { userId: '2', username: 'B', displayName: 'B' }
    ] });
  });

  test('handles fetch errors', async () => {
    const guild = {
      members: { cache: makeCollection([]) }
    };
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => guild) } } });
    const req = {};
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    ensureGuildMembersFetched.mockRejectedValueOnce(new Error('fail'));

    await listMembers(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });

  test('returns 500 when client missing', async () => {
    getClient.mockReturnValue(null);
    const req = {};
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listMembers(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Discord client unavailable' });
    spy.mockRestore();
  });
});
