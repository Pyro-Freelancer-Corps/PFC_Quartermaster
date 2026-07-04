jest.mock('../../config/database', () => ({
  ScChangelogEntry: { destroy: jest.fn() },
}));

const { removeScChangelog } = require('../../scripts/removeScChangelog');
const { ScChangelogEntry } = require('../../config/database');

describe('removeScChangelog', () => {
  beforeEach(() => jest.clearAllMocks());

  test('destroys all rows matching the given version pair', async () => {
    ScChangelogEntry.destroy.mockResolvedValue(4);

    const count = await removeScChangelog('v1', 'v2');

    expect(ScChangelogEntry.destroy).toHaveBeenCalledWith({ where: { versionFrom: 'v1', versionTo: 'v2' } });
    expect(count).toBe(4);
  });
});
