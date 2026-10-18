const { authMiddleware, requireServerAdmin } = require('../../api/auth');
const jwt = require('jsonwebtoken');

describe('api/auth authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn() };
  }

  test('passes through with valid token', () => {
    const token = jwt.sign({ id: 1 }, 'secret');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects missing token', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid token', () => {
    const badToken = jwt.sign({ id: 1 }, 'other');
    const req = { headers: { authorization: `Bearer ${badToken}` } };
    const res = mockRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('api/auth requireServerAdmin', () => {
  function mockRes() { return { status: jest.fn().mockReturnThis(), json: jest.fn() }; }

  test('passes with Commodore role', () => {
    const req = { user: { roles: ['Commodore'] } };
    const res = mockRes();
    const next = jest.fn();
    requireServerAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects when role missing', () => {
    const req = { user: { roles: ['User'] } };
    const res = mockRes();
    const next = jest.fn();
    requireServerAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient role' });
    expect(next).not.toHaveBeenCalled();
  });
});
