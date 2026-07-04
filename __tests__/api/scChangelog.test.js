jest.mock('../../config/database', () => ({
  ScChangelogEntry: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
  sequelize: {
    fn: jest.fn((fnName, col) => `${fnName}(${col})`),
    col: jest.fn((name) => name),
  },
}));

const { listChangelog, listVersions } = require('../../api/scChangelog');
const { ScChangelogEntry } = require('../../config/database');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('api/scChangelog listVersions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns distinct version pairs', async () => {
    ScChangelogEntry.findAll.mockResolvedValue([
      { versionFrom: 'v1', versionTo: 'v2' },
    ]);
    const res = mockRes();

    await listVersions({}, res);

    expect(res.json).toHaveBeenCalledWith({ versions: [{ versionFrom: 'v1', versionTo: 'v2' }] });
  });

  test('handles errors', async () => {
    ScChangelogEntry.findAll.mockRejectedValue(new Error('fail'));
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listVersions({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});

describe('api/scChangelog listChangelog', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses explicit from/to/category query params', async () => {
    ScChangelogEntry.findAll.mockResolvedValue([
      {
        category: 'ships',
        recordRef: 'ref-1',
        recordName: 'Avenger',
        recordType: 'EntityClassDefinition',
        fieldKey: 'crew_size',
        label: 'Crew Size',
        unit: null,
        oldValue: '1',
        newValue: '2',
      },
    ]);
    const req = { query: { from: 'v1', to: 'v2', category: 'ships' } };
    const res = mockRes();

    await listChangelog(req, res);

    expect(ScChangelogEntry.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { versionFrom: 'v1', versionTo: 'v2', category: 'ships' } })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      versionFrom: 'v1',
      versionTo: 'v2',
      entries: [expect.objectContaining({ recordName: 'Avenger' })],
    }));
  });

  test('defaults to the latest version pair when from/to are omitted', async () => {
    ScChangelogEntry.findOne.mockResolvedValue({ versionFrom: 'v3', versionTo: 'v4' });
    ScChangelogEntry.findAll.mockResolvedValue([]);
    const req = { query: {} };
    const res = mockRes();

    await listChangelog(req, res);

    expect(ScChangelogEntry.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { versionFrom: 'v3', versionTo: 'v4' } })
    );
    expect(res.json).toHaveBeenCalledWith({ versionFrom: 'v3', versionTo: 'v4', entries: [] });
  });

  test('returns empty result when no changelog data exists at all', async () => {
    ScChangelogEntry.findOne.mockResolvedValue(null);
    const req = { query: {} };
    const res = mockRes();

    await listChangelog(req, res);

    expect(res.json).toHaveBeenCalledWith({ versionFrom: null, versionTo: null, entries: [] });
  });

  test('handles errors', async () => {
    ScChangelogEntry.findOne.mockRejectedValue(new Error('fail'));
    const req = { query: {} };
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listChangelog(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});
