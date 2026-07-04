jest.mock('../../config/database', () => ({
  ScChangelogEntry: { upsert: jest.fn() },
}));
jest.mock('fs');

const fs = require('fs');
const { ingestScChangelog, buildDedupeKey } = require('../../scripts/ingestScChangelog');
const { ScChangelogEntry } = require('../../config/database');

describe('buildDedupeKey', () => {
  test('is deterministic for the same inputs', () => {
    const a = buildDedupeKey('v1', 'v2', 'ref-1', 'field-1');
    const b = buildDedupeKey('v1', 'v2', 'ref-1', 'field-1');
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });

  test('differs when any input differs', () => {
    const a = buildDedupeKey('v1', 'v2', 'ref-1', 'field-1');
    const b = buildDedupeKey('v1', 'v2', 'ref-1', 'field-2');
    expect(a).not.toBe(b);
  });
});

describe('ingestScChangelog', () => {
  beforeEach(() => jest.clearAllMocks());

  test('upserts each entry and tallies created/updated/skipped', async () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({
      version_from: 'v1',
      version_to: 'v2',
      entries: [
        { category: 'ships', record_ref: 'ref-1', record_name: 'Avenger', record_type: 'EntityClassDefinition', field_key: 'crew_size', label: 'Crew Size', unit: null, old_value: 1, new_value: 2 },
        { category: 'weapons', record_ref: 'ref-2', record_name: 'Gatling', record_type: 'EntityClassDefinition', field_key: 'ammo_capacity', label: 'Ammo Capacity', unit: 'rounds', old_value: 100, new_value: 200 },
        { category: 'ships', record_ref: null, field_key: 'bad' }, // missing record_ref -> skipped
      ],
    }));
    ScChangelogEntry.upsert
      .mockResolvedValueOnce([{}, true])   // created
      .mockResolvedValueOnce([{}, false]); // updated

    const result = await ingestScChangelog('changelog.json');

    expect(ScChangelogEntry.upsert).toHaveBeenCalledTimes(2);
    expect(ScChangelogEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({
      versionFrom: 'v1',
      versionTo: 'v2',
      recordRef: 'ref-1',
      fieldKey: 'crew_size',
      oldValue: '1',
      newValue: '2',
    }));
    expect(result).toEqual({ versionFrom: 'v1', versionTo: 'v2', created: 1, updated: 1, skipped: 1, total: 3 });
  });

  test('throws when the changelog file is missing required top-level fields', async () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ entries: [] }));

    await expect(ingestScChangelog('bad.json')).rejects.toThrow(
      'changelog.json missing version_from/version_to/entries'
    );
  });
});
