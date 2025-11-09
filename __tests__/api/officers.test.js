jest.mock('../../config/database', () => ({
  OfficerBio: { findAll: jest.fn() },
  OfficerProfile: { findAll: jest.fn() }
}));

const { listOfficers } = require('../../api/officers');
const { OfficerBio, OfficerProfile } = require('../../config/database');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('api/officers listOfficers', () => {
  test('returns officers from cached profiles', async () => {
    OfficerProfile.findAll.mockResolvedValue([
      { user_id: '1', username: 'A', display_name: 'Alpha', role_name: 'Officer', role_color: '#fff', synced_at: 100 },
      { user_id: '2', username: 'B', display_name: 'Bravo', role_name: 'Captain', role_color: '#000', synced_at: 120 }
    ]);
    OfficerBio.findAll.mockResolvedValue([
      { discordUserId: '1', bio: 'hi' }
    ]);

    const req = {}; const res = mockRes();
    await listOfficers(req, res);

    expect(OfficerProfile.findAll).toHaveBeenCalled();
    expect(OfficerBio.findAll).toHaveBeenCalledWith({ where: { discordUserId: ['1', '2'] } });
    expect(res.json).toHaveBeenCalledWith({
      officers: [
        { userId: '2', username: 'B', displayName: 'Bravo', roleName: 'Captain', roleColor: '#000', bio: null, syncedAt: 120 },
        { userId: '1', username: 'A', displayName: 'Alpha', roleName: 'Officer', roleColor: '#fff', bio: 'hi', syncedAt: 100 }
      ],
      syncedAt: 120,
      stale: false
    });
  });

  test('returns stale flag when no profiles exist', async () => {
    OfficerProfile.findAll.mockResolvedValue([]);
    OfficerBio.findAll.mockResolvedValue([]);
    const req = {}; const res = mockRes();

    await listOfficers(req, res);

    expect(res.json).toHaveBeenCalledWith({ officers: [], syncedAt: null, stale: true });
  });

  test('handles errors gracefully', async () => {
    const req = {}; const res = mockRes();
    const err = new Error('fail');
    OfficerProfile.findAll.mockRejectedValue(err);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listOfficers(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});
