jest.mock('../../config/database', () => ({ Accolade: { findAll: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../../discordClient', () => ({ getClient: jest.fn() }));
jest.mock('../../config.json', () => ({ guildId: 'g1' }), { virtual: true });
jest.mock('../../utils/ensureGuildMembersFetched', () => ({
  ensureGuildMembersFetched: jest.fn().mockResolvedValue()
}));

const { listAccolades, getAccolade } = require('../../api/accolades');
const { Accolade } = require('../../config/database');
const { getClient } = require('../../discordClient');
const { ensureGuildMembersFetched } = require('../../utils/ensureGuildMembersFetched');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

const makeCollection = arr => ({
  filter: fn => makeCollection(arr.filter(fn)),
  map: fn => arr.map(fn)
});

describe('api/accolades listAccolades', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('returns accolades with recipients', async () => {
    const req = {};
    const res = mockRes();
    Accolade.findAll.mockResolvedValue([
      { id: 1, role_id: 'r1', name: 'A' },
      { id: 2, role_id: 'r2', name: 'B' }
    ]);

    const members = [
      { id: 'u1', displayName: 'Alice', roles: { cache: [{ id: 'r1' }] } },
      { id: 'u2', displayName: 'Bob', roles: { cache: [{ id: 'r2' }] } },
      { id: 'u3', displayName: 'Charlie', roles: { cache: [] } }
    ];
    const guild = { members: { cache: makeCollection(members) } };
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => guild) } } });

    await listAccolades(req, res);

    expect(Accolade.findAll).toHaveBeenCalled();
    expect(ensureGuildMembersFetched).toHaveBeenCalledWith(guild);
    expect(res.json).toHaveBeenCalledWith({
      accolades: [
        { id: 1, role_id: 'r1', name: 'A', recipients: [{ id: 'u1', displayName: 'Alice' }] },
        { id: 2, role_id: 'r2', name: 'B', recipients: [{ id: 'u2', displayName: 'Bob' }] }
      ]
    });
  });

  test('handles database errors', async () => {
    const req = {};
    const res = mockRes();
    const err = new Error('fail');
    Accolade.findAll.mockRejectedValue(err);
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => ({ members: { cache: makeCollection([]) } })) } } });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listAccolades(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });

  test('returns 500 when client missing', async () => {
    const req = {};
    const res = mockRes();
    Accolade.findAll.mockResolvedValue([]);
    getClient.mockReturnValue(null);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listAccolades(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Discord client unavailable' });
    spy.mockRestore();
  });
});

describe('api/accolades getAccolade', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('returns accolade with recipients', async () => {
    const req = { params: { id: '1' } };
    const res = mockRes();
    Accolade.findByPk.mockResolvedValue({ id: 1, role_id: 'r1', name: 'A' });
    const members = [
      { id: 'u1', displayName: 'Alice', roles: { cache: [{ id: 'r1' }] } }
    ];
    const guild = { members: { cache: makeCollection(members) } };
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => guild) } } });

    await getAccolade(req, res);

    expect(Accolade.findByPk).toHaveBeenCalledWith('1');
    expect(ensureGuildMembersFetched).toHaveBeenCalledWith(guild);
    expect(res.json).toHaveBeenCalledWith({ accolade: { id: 1, role_id: 'r1', name: 'A', recipients: [{ id: 'u1', displayName: 'Alice' }] } });
  });

  test('returns 404 when not found', async () => {
    const req = { params: { id: '2' } };
    const res = mockRes();
    Accolade.findByPk.mockResolvedValue(null);

    await getAccolade(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  test('handles errors', async () => {
    const req = { params: { id: '3' } };
    const res = mockRes();
    const err = new Error('fail');
    Accolade.findByPk.mockRejectedValue(err);
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => ({ members: { fetch: jest.fn(), cache: makeCollection([]) } })) } } });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await getAccolade(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});
