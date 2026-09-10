const syncEndpoints = require('../../../botactions/api/syncEndpoints');
const { runFullApiSync } = require('../../../utils/apiSync/syncApiData');
const { MockInteraction } = require('../../../__mocks__/discord.js');

jest.mock('../../../botactions/api/syncEndpoints', () => ({
  syncManufacturers: jest.fn().mockResolvedValue({}),
  syncUexTerminals: jest.fn().mockResolvedValue({}),
  syncVehicles: jest.fn().mockResolvedValue({}),
  syncGalactapedia: jest.fn().mockResolvedValue({}),
  syncGalactapediaDetails: jest.fn().mockResolvedValue({}),
  syncUexVehicles: jest.fn().mockResolvedValue({}),
  syncUexItemPrices: jest.fn().mockResolvedValue({}),
  syncUexCategories: jest.fn().mockResolvedValue({}),
  syncUexCommodityPrices: jest.fn().mockResolvedValue({}),
  syncUexFuelPrices: jest.fn().mockResolvedValue({}),
  syncUexVehiclePurchasePrices: jest.fn().mockResolvedValue({}),
  syncUexVehicleRentalPrices: jest.fn().mockResolvedValue({}),
  syncUexPois: jest.fn().mockResolvedValue({}),
  syncOrgs: jest.fn().mockResolvedValue({}),
}));

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
    expect(results).toHaveProperty('Shops');
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
    expect(editSpy).toHaveBeenCalledTimes(16);
    const lastCall = editSpy.mock.calls.at(-1)[0];
    const embedData = lastCall.embeds[0].toJSON();
    expect(embedData.title).toBe('✅ API Sync Complete');
    expect(embedData.description).toContain('Shops');
    expect(results).toHaveProperty('Points of Interest');
  });

  test('marks failed endpoint as ERR in table', async () => {
    syncEndpoints.syncUexFuelPrices.mockRejectedValueOnce(new Error('fail'));
    const interaction = new MockInteraction({});
    const editSpy = jest.spyOn(interaction, 'editReply');
    const results = await runFullApiSync(interaction);
    const finalDesc = editSpy.mock.calls.at(-1)[0].embeds[0].toJSON().description;
    expect(finalDesc).toContain('ERR');
    expect(results['Fuel']).toEqual({ error: true });
    expect(errorSpy).toHaveBeenCalled();
  });
});
