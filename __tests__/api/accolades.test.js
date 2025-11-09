jest.mock('../../config/database', () => ({
  Accolade: { findAll: jest.fn(), findByPk: jest.fn() },
  AccoladeRecipient: { findAll: jest.fn() }
}));

const { listAccolades, getAccolade } = require('../../api/accolades');
const { Accolade, AccoladeRecipient } = require('../../config/database');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('api/accolades listAccolades', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns accolades with cached recipients', async () => {
    const req = {};
    const res = mockRes();
    Accolade.findAll.mockResolvedValue([
      { id: 1, role_id: 'r1', name: 'A' },
      { id: 2, role_id: 'r2', name: 'B' }
    ]);
    AccoladeRecipient.findAll.mockResolvedValue([
      { accolade_id: 1, user_id: 'u1', username: 'alice', display_name: 'Alice', synced_at: 100 },
      { accolade_id: 2, user_id: 'u2', username: 'bob', display_name: 'Bob', synced_at: 200 }
    ]);

    await listAccolades(req, res);

    expect(Accolade.findAll).toHaveBeenCalled();
    expect(AccoladeRecipient.findAll).toHaveBeenCalledWith({ where: { accolade_id: [1, 2] } });
    expect(res.json).toHaveBeenCalledWith({
      accolades: [
        {
          id: 1,
          role_id: 'r1',
          name: 'A',
          recipients: [{ id: 'u1', username: 'alice', displayName: 'Alice', syncedAt: 100 }],
          syncedAt: 100
        },
        {
          id: 2,
          role_id: 'r2',
          name: 'B',
          recipients: [{ id: 'u2', username: 'bob', displayName: 'Bob', syncedAt: 200 }],
          syncedAt: 200
        }
      ]
    });
  });

  test('handles database errors', async () => {
    const req = {};
    const res = mockRes();
    const err = new Error('fail');
    Accolade.findAll.mockRejectedValue(err);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listAccolades(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});

describe('api/accolades getAccolade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns single accolade with cached recipients', async () => {
    const req = { params: { id: '1' } };
    const res = mockRes();
    Accolade.findByPk.mockResolvedValue({ id: 1, role_id: 'r1', name: 'A' });
    AccoladeRecipient.findAll.mockResolvedValue([
      { accolade_id: 1, user_id: 'u1', username: 'alice', display_name: 'Alice', synced_at: 100 }
    ]);

    await getAccolade(req, res);

    expect(Accolade.findByPk).toHaveBeenCalledWith('1');
    expect(AccoladeRecipient.findAll).toHaveBeenCalledWith({ where: { accolade_id: 1 } });
    expect(res.json).toHaveBeenCalledWith({
      accolade: {
        id: 1,
        role_id: 'r1',
        name: 'A',
        recipients: [{ id: 'u1', username: 'alice', displayName: 'Alice', syncedAt: 100 }],
        syncedAt: 100
      }
    });
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
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await getAccolade(req, res);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});
