const syncEndpoints = require('../../../botactions/api/syncEndpoints');
const { runFullApiSync } = require('../../../utils/apiSync/syncApiData');
const { MockInteraction } = require('../../../__mocks__/discord.js');

jest.mock('../../../botactions/api/syncEndpoints', () => ({
  syncManufacturers: jest.fn().mockResolvedValue({}),
  syncVehicles: jest.fn().mockResolvedValue({}),
  syncGalactapedia: jest.fn().mockResolvedValue({}),
  syncGalactapediaDetails: jest.fn().mockResolvedValue({}),
  syncOrgs: jest.fn().mockResolvedValue({}),
}));

const STEPS = [
  'Manufacturers',
  'Galactapedia',
  'Galactapedia Details',
  'Vehicles (wiki)',
  'Organizations',
];

describe('runFullApiSync', () => {
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('calls all sync endpoints', async () => {
    const results = await runFullApiSync();
    for (const fn of Object.values(syncEndpoints)) {
      expect(fn).toHaveBeenCalled();
    }
    for (const step of STEPS) {
      expect(results).toHaveProperty(step);
    }
    expect(Object.keys(results)).toHaveLength(STEPS.length);
  });

  test('handles errors from an endpoint', async () => {
    syncEndpoints.syncVehicles.mockRejectedValueOnce(new Error('fail'));
    const results = await runFullApiSync();
    expect(results['Vehicles (wiki)']).toEqual({ error: true });
    expect(errorSpy).toHaveBeenCalled();
  });

  test('updates interaction embed as it runs', async () => {
    const interaction = new MockInteraction({});
    const editSpy = jest.spyOn(interaction, 'editReply');
    const results = await runFullApiSync(interaction);

    // one initial render, one per step, one final
    expect(editSpy).toHaveBeenCalledTimes(STEPS.length + 2);

    const lastCall = editSpy.mock.calls.at(-1)[0];
    const embedData = lastCall.embeds[0].toJSON();
    expect(embedData.title).toBe('✅ API Sync Complete');
    for (const step of STEPS) {
      expect(embedData.description).toContain(step);
    }
    expect(results).toHaveProperty('Organizations');
  });

  test('marks failed endpoint as ERR in table', async () => {
    syncEndpoints.syncGalactapedia.mockRejectedValueOnce(new Error('boom'));

    const interaction = new MockInteraction({});
    const editSpy = jest.spyOn(interaction, 'editReply');
    const results = await runFullApiSync(interaction);

    const finalDesc = editSpy.mock.calls.at(-1)[0].embeds[0].toJSON().description;
    expect(finalDesc).toContain('ERR');
    expect(results['Galactapedia']).toEqual({ error: true });
    expect(errorSpy).toHaveBeenCalled();
  });
});
