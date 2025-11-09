jest.mock('../../../config/database', () => ({
  Accolade: { findAll: jest.fn() },
  AccoladeRecipient: { destroy: jest.fn(), bulkCreate: jest.fn() },
  OfficerProfile: { destroy: jest.fn(), bulkCreate: jest.fn() }
}));
jest.mock('../../../utils/fetchGuildMembers', () => {
  const actual = jest.requireActual('../../../utils/fetchGuildMembers');
  return {
    fetchGuildMembers: jest.fn(),
    _private: actual._private
  };
});

const { syncGuildSnapshot, _private } = require('../../../botactions/memberSnapshot/syncGuildSnapshot');
const { Accolade, AccoladeRecipient, OfficerProfile } = require('../../../config/database');
const { fetchGuildMembers } = require('../../../utils/fetchGuildMembers');

const makeRole = (id, { permissions = { has: () => false }, position = 1, name = 'Role', hexColor = '#fff' } = {}) => ({
  id,
  permissions,
  position,
  name,
  hexColor
});

const makeMember = ({ id, roles = [], permissionsHas = () => false, username = 'user', displayName = 'User' }) => ({
  id,
  user: { username },
  displayName,
  roles: {
    cache: {
      has: roleId => roles.some(role => role.id === roleId),
      [Symbol.iterator]: roles[Symbol.iterator].bind(roles),
      values: () => roles.values()
    }
  },
  permissions: { has: permissionsHas }
});

describe('syncGuildSnapshot', () => {
  let client;
  let guild;
  let members;

  beforeEach(() => {
    jest.clearAllMocks();
    Accolade.findAll.mockResolvedValue([{ id: 1, role_id: 'r1', name: 'Test' }]);
    AccoladeRecipient.destroy.mockResolvedValue();
    AccoladeRecipient.bulkCreate.mockResolvedValue();
    OfficerProfile.destroy.mockResolvedValue();
    OfficerProfile.bulkCreate.mockResolvedValue();

    members = [
      makeMember({
        id: '1',
        roles: [makeRole('r1', { permissions: { has: () => true }, position: 5, name: 'Officer', hexColor: '#abc' })],
        permissionsHas: () => true
      }),
      makeMember({ id: '2', roles: [makeRole('r2')] })
    ];

    guild = {
      members: {
        cache: { size: 0 }
      },
      roles: { cache: { values: () => [makeRole('r1'), makeRole('r2')].values() }, fetch: jest.fn().mockResolvedValue() }
    };
    fetchGuildMembers.mockResolvedValue(members);

    client = {
      config: { guildId: 'guild1' },
      guilds: {
        cache: new Map([['guild1', guild]]),
        fetch: jest.fn()
      }
    };
  });

  test('snapshots accolades and officers into database', async () => {
    const result = await syncGuildSnapshot(client);

    expect(result.success).toBe(true);
    expect(AccoladeRecipient.destroy).toHaveBeenCalledWith({ where: {} });
    expect(AccoladeRecipient.bulkCreate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ accolade_id: 1, user_id: '1' })
    ]));
    expect(OfficerProfile.destroy).toHaveBeenCalledWith({ where: {} });
    expect(OfficerProfile.bulkCreate).toHaveBeenCalled();
  });

  test('handles missing guildId gracefully', async () => {
    client.config.guildId = null;
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await syncGuildSnapshot(client);

    expect(result.success).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('handles guild fetch failure', async () => {
    client.guilds.cache = new Map();
    client.guilds.fetch = jest.fn().mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await syncGuildSnapshot(client);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('guildUnavailable');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('handles hydration failure', async () => {
    fetchGuildMembers.mockResolvedValue([]);
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await syncGuildSnapshot(client);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('memberFetchFailed');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('recovers when no members qualify as officers', async () => {
    members = [
      makeMember({ id: '3', roles: [makeRole('r3')], permissionsHas: () => false })
    ];
    fetchGuildMembers.mockResolvedValue(members);

    const result = await syncGuildSnapshot(client);

    expect(result.success).toBe(true);
    expect(OfficerProfile.bulkCreate).not.toHaveBeenCalled();
  });

  test('continues when accolade fetch fails', async () => {
    Accolade.findAll.mockRejectedValueOnce(new Error('db'));
    fetchGuildMembers.mockResolvedValue(members);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await syncGuildSnapshot(client);

    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('memberSnapshot helpers', () => {
  test('toArray handles null and array inputs', () => {
    expect(_private.toArray(null)).toEqual([]);
    const arr = [1, 2];
    expect(_private.toArray(arr)).toBe(arr);
  });

  test('toArray falls back to Object.values', () => {
    const obj = { a: 1, b: 2 };
    expect(_private.toArray(obj)).toEqual([1, 2]);
  });

  test('memberHasRole respects has method and array fallback', () => {
    const roleMember = {
      roles: { cache: { has: jest.fn().mockReturnValue(true) } }
    };
    expect(_private.memberHasRole(roleMember, 'role')).toBe(true);

    const otherMember = {
      roles: { cache: [{ id: 'x' }, { id: 'y' }] }
    };
    expect(_private.memberHasRole(otherMember, 'y')).toBe(true);
    expect(_private.memberHasRole(otherMember, 'z')).toBe(false);
  });

  test('snapshotAccolades handles bulk create failures', async () => {
    Accolade.findAll.mockResolvedValue([{ id: 9, role_id: 'rx' }]);
    AccoladeRecipient.bulkCreate.mockRejectedValueOnce(new Error('db'));
    const members = [
      { id: 'user', roles: { cache: { has: () => true } }, user: { username: 'user' }, displayName: 'User' }
    ];
    const result = await _private.snapshotAccolades(members, 123);
    expect(result).toBe(0);
  });

  test('snapshotOfficers handles bulk create failures', async () => {
    OfficerProfile.bulkCreate.mockRejectedValueOnce(new Error('db'));
    const members = [
      {
        id: 'officer',
        user: { username: 'O' },
        displayName: 'Officer',
        permissions: { has: () => true },
        roles: { cache: [{ id: 'role', permissions: { has: () => true }, position: 1 }] }
      }
    ];
    const result = await _private.snapshotOfficers(members, 456);
    expect(result).toBe(0);
  });
});
