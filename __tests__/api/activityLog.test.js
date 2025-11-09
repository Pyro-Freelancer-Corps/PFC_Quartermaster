jest.mock('../../config/database', () => ({
  UsageLog: { findAll: jest.fn() },
  sequelize: { fn: jest.fn((name, col) => `${name}(${col})`), col: jest.fn(name => name) }
}));
jest.mock('../../discordClient', () => ({ getClient: jest.fn() }));
jest.mock('../../config.json', () => ({ guildId: 'g1' }), { virtual: true });
jest.mock('../../utils/ensureGuildMembersFetched', () => ({
  ensureGuildMembersFetched: jest.fn().mockResolvedValue()
}));

const { Op } = require('sequelize');
const {
  searchLogs,
  searchLogsPost,
  listEventTypes
} = require('../../api/activityLog');
const { UsageLog } = require('../../config/database');
const { getClient } = require('../../discordClient');
const { ensureGuildMembersFetched } = require('../../utils/ensureGuildMembersFetched');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

const makeCollection = arr => ({
  map: fn => arr.map(fn),
  get: id => arr.find(i => i.id === id)
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('api/activityLog searchLogs', () => {
  test('returns logs with filters', async () => {
    const req = { query: { page: '2', limit: '1', type: 'LOGIN', userId: 'u1', command: 'ping', message: 'hi' } };
    const res = mockRes();
    const logs = [{ channel_id: 'c1', user_id: 'u1', toJSON() { return { channel_id: 'c1', user_id: 'u1' }; } }];
    UsageLog.findAll.mockResolvedValue(logs);
    const guild = {
      members: { cache: makeCollection([{ id: 'u1', user: { username: 'bob' }, displayName: 'Bob' }]) },
      channels: { cache: makeCollection([{ id: 'c1', name: 'general' }]) }
    };
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => guild) } } });

    await searchLogs(req, res);

    expect(UsageLog.findAll).toHaveBeenCalledWith({
      where: {
        server_id: 'g1',
        event_type: 'LOGIN',
        user_id: 'u1',
        command_name: 'ping',
        message_content: { [Op.like]: '%hi%' }
      },
      limit: 1,
      offset: 1,
      order: [['timestamp', 'DESC']]
    });
    expect(ensureGuildMembersFetched).toHaveBeenCalledWith(guild);
    expect(res.json).toHaveBeenCalledWith({ logs: [{ channel_id: 'c1', user_id: 'u1', channelName: 'general', memberName: 'bob', displayName: 'Bob' }] });
  });

  test('handles errors', async () => {
    const req = { query: {} };
    const res = mockRes();
    UsageLog.findAll.mockRejectedValue(new Error('fail'));
    const guild = {
      members: { cache: makeCollection([]) },
      channels: { cache: makeCollection([]) }
    };
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => guild) } } });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await searchLogs(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });

  test('returns 500 when client missing', async () => {
    getClient.mockReturnValue(null);
    const req = { query: {} };
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await searchLogs(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Discord client unavailable' });
    spy.mockRestore();
  });
});

describe('api/activityLog searchLogsPost', () => {
  test('returns logs using body', async () => {
    const req = { body: { page: 1, limit: 2, filters: { command: 'trade' } } };
    const res = mockRes();
    const logs = [{ channel_id: 'c1', user_id: 'u1', toJSON() { return { channel_id: 'c1', user_id: 'u1' }; } }];
    UsageLog.findAll.mockResolvedValue(logs);
    const guild = {
      members: { cache: makeCollection([{ id: 'u1', user: { username: 'bob' }, displayName: 'Bob' }]) },
      channels: { cache: makeCollection([{ id: 'c1', name: 'general' }]) }
    };
    getClient.mockReturnValue({ guilds: { cache: { get: jest.fn(() => guild) } } });

    await searchLogsPost(req, res);

    expect(UsageLog.findAll).toHaveBeenCalledWith({
      where: { server_id: 'g1', command_name: 'trade' },
      limit: 2,
      offset: 0,
      order: [['timestamp', 'DESC']]
    });
    expect(ensureGuildMembersFetched).toHaveBeenCalledWith(guild);
    expect(res.json).toHaveBeenCalledWith({ logs: [{ channel_id: 'c1', user_id: 'u1', channelName: 'general', memberName: 'bob', displayName: 'Bob' }] });
  });

  test('returns 500 when client missing', async () => {
    getClient.mockReturnValue(null);
    const req = { body: {} };
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await searchLogsPost(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Discord client unavailable' });
    spy.mockRestore();
  });
});

describe('api/activityLog listEventTypes', () => {
  test('returns event type list', async () => {
    const req = {};
    const res = mockRes();
    UsageLog.findAll.mockResolvedValue([
      { get: field => (field === 'event_type' ? 'a' : undefined) },
      { get: field => (field === 'event_type' ? 'b' : undefined) }
    ]);

    await listEventTypes(req, res);

    expect(UsageLog.findAll).toHaveBeenCalledWith({
      attributes: [['DISTINCT(event_type)', 'event_type']],
      where: { server_id: 'g1' }
    });
    expect(res.json).toHaveBeenCalledWith({ eventTypes: ['a', 'b'] });
  });

  test('handles errors', async () => {
    const req = {};
    const res = mockRes();
    UsageLog.findAll.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listEventTypes(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});
