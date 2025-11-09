jest.mock('../../utils/ensureGuildMembersFetched', () => ({
  ensureGuildMembersFetched: jest.fn().mockResolvedValue()
}));

const getGuildMembersWithRoles = require('../../utils/getGuildMembersWithRoles');
const { ensureGuildMembersFetched } = require('../../utils/ensureGuildMembersFetched');

describe('getGuildMembersWithRoles', () => {
  const makeCollection = arr => ({
    filter: fn => makeCollection(arr.filter(fn)),
    map: fn => arr.map(fn)
  });

  test('returns members whose roles match provided names', async () => {
    const roles = [{ id: '1', name: 'Admin' }, { id: '2', name: 'Pilot' }];
    const membersArr = [
      { id: 'm1', roles: { cache: [{ id: '1' }] } },
      { id: 'm2', roles: { cache: [{ id: '2' }] } },
      { id: 'm3', roles: { cache: [] } }
    ];
    const guild = {
      roles: { cache: makeCollection(roles) },
      members: {
        cache: makeCollection(membersArr)
      }
    };

    const res = await getGuildMembersWithRoles(guild, ['Admin', 'Pilot']);

    expect(ensureGuildMembersFetched).toHaveBeenCalledWith(guild);
    expect(res).toEqual([membersArr[0], membersArr[1]]);
  });
});
