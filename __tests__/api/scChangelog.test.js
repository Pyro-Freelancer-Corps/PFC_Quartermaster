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

const {
  listChangelog,
  listVersions,
  listKnownVersions,
  getOrderedVersions,
  findVersionPath,
} = require('../../api/scChangelog');
const { ScChangelogEntry } = require('../../config/database');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

// Configures ScChangelogEntry.findAll to serve both call shapes used by the
// chain-walk logic: the getOrderedVersions() group-by calls (distinguished
// by `group`) and everything else (direct-pair / chain-hop lookups).
function mockFindAll({ versionFroms = [], versionTos = [], other = [] } = {}) {
  ScChangelogEntry.findAll.mockImplementation((opts) => {
    if (opts?.group?.[0] === 'versionFrom') return Promise.resolve(versionFroms.map(v => ({ versionFrom: v })));
    if (opts?.group?.[0] === 'versionTo') return Promise.resolve(versionTos.map(v => ({ versionTo: v })));
    return Promise.resolve(other);
  });
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

describe('getOrderedVersions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sorts by embedded date, not alphabetically', async () => {
    mockFindAll({
      versionFroms: ['sc-alpha-4.9.0_20260702'],
      versionTos: ['sc-alpha-4.8.0_20260629', 'sc-alpha-4.10.0_20260801'],
    });

    const ordered = await getOrderedVersions();

    // Alphabetical sort would put 4.10.0 before 4.9.0 -- date sort must not.
    expect(ordered).toEqual([
      'sc-alpha-4.8.0_20260629',
      'sc-alpha-4.9.0_20260702',
      'sc-alpha-4.10.0_20260801',
    ]);
  });

  test('ignores labels with no parseable trailing date', async () => {
    mockFindAll({ versionFroms: ['not-a-real-version'], versionTos: ['sc-alpha-4.8.0_20260629'] });

    const ordered = await getOrderedVersions();

    expect(ordered).toEqual(['sc-alpha-4.8.0_20260629']);
  });
});

describe('findVersionPath', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the full ordered slice between two known versions', async () => {
    mockFindAll({
      versionFroms: ['sc_20260601', 'sc_20260602', 'sc_20260603'],
      versionTos: ['sc_20260602', 'sc_20260603', 'sc_20260604'],
    });

    const path = await findVersionPath('sc_20260601', 'sc_20260604');

    expect(path).toEqual(['sc_20260601', 'sc_20260602', 'sc_20260603', 'sc_20260604']);
  });

  test('auto-swaps reversed input', async () => {
    mockFindAll({
      versionFroms: ['sc_20260601', 'sc_20260602'],
      versionTos: ['sc_20260602', 'sc_20260603'],
    });

    const path = await findVersionPath('sc_20260603', 'sc_20260601');

    expect(path).toEqual(['sc_20260601', 'sc_20260602', 'sc_20260603']);
  });

  test('returns null when an endpoint is unknown', async () => {
    mockFindAll({ versionFroms: ['sc_20260601'], versionTos: ['sc_20260602'] });

    const path = await findVersionPath('sc_20260601', 'sc_nonexistent');

    expect(path).toBeNull();
  });
});

describe('api/scChangelog listKnownVersions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the ordered version list', async () => {
    mockFindAll({ versionFroms: ['sc_20260601'], versionTos: ['sc_20260602'] });
    const res = mockRes();

    await listKnownVersions({}, res);

    expect(res.json).toHaveBeenCalledWith({ versions: ['sc_20260601', 'sc_20260602'] });
  });

  test('handles errors', async () => {
    ScChangelogEntry.findAll.mockRejectedValue(new Error('fail'));
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await listKnownVersions({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    spy.mockRestore();
  });
});

describe('api/scChangelog listChangelog', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses explicit from/to/category query params — direct match wins, no chain-walk needed', async () => {
    mockFindAll({
      other: [{
        category: 'ships',
        recordRef: 'ref-1',
        recordName: 'Avenger',
        recordType: 'EntityClassDefinition',
        fieldKey: 'crew_size',
        label: 'Crew Size',
        unit: null,
        oldValue: '1',
        newValue: '2',
      }],
    });
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

  test('defaults to the latest version pair when from/to are omitted, empty is a real answer when adjacent', async () => {
    ScChangelogEntry.findOne.mockResolvedValue({ versionFrom: 'sc_20260603', versionTo: 'sc_20260604' });
    mockFindAll({
      versionFroms: ['sc_20260603'],
      versionTos: ['sc_20260604'],
      other: [], // the direct-pair query itself
    });
    const req = { query: {} };
    const res = mockRes();

    await listChangelog(req, res);

    expect(res.json).toHaveBeenCalledWith({ versionFrom: 'sc_20260603', versionTo: 'sc_20260604', entries: [] });
  });

  test('returns empty result when no changelog data exists at all', async () => {
    ScChangelogEntry.findOne.mockResolvedValue(null);
    const req = { query: {} };
    const res = mockRes();

    await listChangelog(req, res);

    expect(res.json).toHaveBeenCalledWith({ versionFrom: null, versionTo: null, entries: [] });
  });

  test('404s when an endpoint has no data at all', async () => {
    mockFindAll({ versionFroms: ['sc_20260601'], versionTos: ['sc_20260602'], other: [] });
    const req = { query: { from: 'sc_20260601', to: 'sc_nonexistent' } };
    const res = mockRes();

    await listChangelog(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('chain-walks across a gap where the middle hop had zero changes (A-B has changes, B-C none, C-D has changes)', async () => {
    // A->B: Insurance Fee changed. B->C: nothing (no rows at all). C->D: Insurance Fee changed again.
    const allRows = [
      {
        versionFrom: 'sc_20260601', versionTo: 'sc_20260602',
        category: 'ships', recordRef: 'ref-1', recordName: 'Avenger', recordType: 'EntityClassDefinition',
        fieldKey: 'insurance_expedite_fee', label: 'Insurance Expedite Fee', unit: 'aUEC',
        oldValue: '2343', newValue: '4200',
      },
      {
        versionFrom: 'sc_20260603', versionTo: 'sc_20260604',
        category: 'ships', recordRef: 'ref-1', recordName: 'Avenger', recordType: 'EntityClassDefinition',
        fieldKey: 'insurance_expedite_fee', label: 'Insurance Expedite Fee', unit: 'aUEC',
        oldValue: '4200', newValue: '5000',
      },
    ];

    ScChangelogEntry.findAll.mockImplementation((opts) => {
      if (opts?.group?.[0] === 'versionFrom') return Promise.resolve([{ versionFrom: 'sc_20260601' }, { versionFrom: 'sc_20260603' }]);
      if (opts?.group?.[0] === 'versionTo') return Promise.resolve([{ versionTo: 'sc_20260602' }, { versionTo: 'sc_20260604' }]);
      // Direct A->D query: no rows (never diffed directly).
      if (opts?.where?.versionFrom === 'sc_20260601' && opts?.where?.versionTo === 'sc_20260604') return Promise.resolve([]);
      // Chain-hop query (Op.or across the 3 hops): return everything, the code filters by hop membership itself.
      return Promise.resolve(allRows);
    });

    const req = { query: { from: 'sc_20260601', to: 'sc_20260604' } };
    const res = mockRes();

    await listChangelog(req, res);

    expect(res.json).toHaveBeenCalledWith({
      versionFrom: 'sc_20260601',
      versionTo: 'sc_20260604',
      entries: [expect.objectContaining({
        recordName: 'Avenger',
        fieldKey: 'insurance_expedite_fee',
        oldValue: '2343', // earliest hop's old value
        newValue: '5000', // latest hop's new value
      })],
    });
  });

  test('a field that changed then reverted across the path nets to no change', async () => {
    const allRows = [
      {
        versionFrom: 'sc_20260601', versionTo: 'sc_20260602',
        category: 'ships', recordRef: 'ref-1', recordName: 'Avenger', recordType: 'EntityClassDefinition',
        fieldKey: 'crew_size', label: 'Crew Size', unit: null, oldValue: '1', newValue: '2',
      },
      {
        versionFrom: 'sc_20260602', versionTo: 'sc_20260603',
        category: 'ships', recordRef: 'ref-1', recordName: 'Avenger', recordType: 'EntityClassDefinition',
        fieldKey: 'crew_size', label: 'Crew Size', unit: null, oldValue: '2', newValue: '1',
      },
    ];

    ScChangelogEntry.findAll.mockImplementation((opts) => {
      if (opts?.group?.[0] === 'versionFrom') return Promise.resolve([{ versionFrom: 'sc_20260601' }, { versionFrom: 'sc_20260602' }]);
      if (opts?.group?.[0] === 'versionTo') return Promise.resolve([{ versionTo: 'sc_20260602' }, { versionTo: 'sc_20260603' }]);
      if (opts?.where?.versionFrom === 'sc_20260601' && opts?.where?.versionTo === 'sc_20260603') return Promise.resolve([]);
      return Promise.resolve(allRows);
    });

    const req = { query: { from: 'sc_20260601', to: 'sc_20260603' } };
    const res = mockRes();

    await listChangelog(req, res);

    expect(res.json).toHaveBeenCalledWith({ versionFrom: 'sc_20260601', versionTo: 'sc_20260603', entries: [] });
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
