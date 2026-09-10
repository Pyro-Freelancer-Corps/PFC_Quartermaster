const {
  syncAllEndpoints,
  syncManufacturers,
  syncVehicles,
  syncGalactapedia,
  syncUexVehicles,
  syncUexTerminals,
  syncUexItemPrices,
  syncUexCategories,
  syncUexCommodityPrices,
  syncUexFuelPrices,
  syncUexVehiclePurchasePrices,
  syncUexVehicleRentalPrices,
  syncUexPois,
  syncOrgs
} = require('../../../botactions/api/syncEndpoints');

jest.mock('../../../utils/apiSync/manufacturers', () => ({ syncManufacturers: jest.fn() }));
jest.mock('../../../utils/apiSync/vehicles', () => ({ syncVehicles: jest.fn() }));
jest.mock('../../../utils/apiSync/galactapedia', () => ({ syncGalactapedia: jest.fn() }));
jest.mock('../../../utils/apiSync/galactapediaDetail', () => ({ syncGalactapediaDetails: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexVehicles', () => ({ syncUexVehicles: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexTerminals', () => ({ syncUexTerminals: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexItemPrices', () => ({ syncUexItemPrices: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexCategories', () => ({ syncUexCategories: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexCommodityPrices', () => ({ syncUexCommodityPrices: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexFuelPrices', () => ({ syncUexFuelPrices: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexVehiclePurchasePrices', () => ({ syncUexVehiclePurchasePrices: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexVehicleRentalPrices', () => ({ syncUexVehicleRentalPrices: jest.fn() }));
jest.mock('../../../utils/apiSync/syncUexPoi', () => ({ syncUexPois: jest.fn() }));
jest.mock('../../../utils/apiSync/orgs', () => ({ syncOrgs: jest.fn() }));

const manufacturers = require('../../../utils/apiSync/manufacturers');
const vehicles = require('../../../utils/apiSync/vehicles');
const galactapedia = require('../../../utils/apiSync/galactapedia');
const galactapediaDetail = require('../../../utils/apiSync/galactapediaDetail');
const uexVehicles = require('../../../utils/apiSync/syncUexVehicles');
const uexTerminals = require('../../../utils/apiSync/syncUexTerminals');
const uexItemPrices = require('../../../utils/apiSync/syncUexItemPrices');
const uexCategories = require('../../../utils/apiSync/syncUexCategories');
const uexCommodityPrices = require('../../../utils/apiSync/syncUexCommodityPrices');
const uexFuelPrices = require('../../../utils/apiSync/syncUexFuelPrices');
const uexVehiclePurchasePrices = require('../../../utils/apiSync/syncUexVehiclePurchasePrices');
const uexVehicleRentalPrices = require('../../../utils/apiSync/syncUexVehicleRentalPrices');
const uexPois = require('../../../utils/apiSync/syncUexPoi');
const orgs = require('../../../utils/apiSync/orgs');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('syncAllEndpoints', () => {
  test('returns results from all sync functions in order', async () => {
    const results = [];
    const fns = [
      uexTerminals.syncUexTerminals,
      manufacturers.syncManufacturers,
      vehicles.syncVehicles,
      galactapedia.syncGalactapedia,
      galactapediaDetail.syncGalactapediaDetails,
      uexVehicles.syncUexVehicles,
      uexItemPrices.syncUexItemPrices,
      uexCategories.syncUexCategories,
      uexCommodityPrices.syncUexCommodityPrices,
      uexFuelPrices.syncUexFuelPrices,
      uexVehiclePurchasePrices.syncUexVehiclePurchasePrices,
      uexVehicleRentalPrices.syncUexVehicleRentalPrices,
      uexPois.syncUexPois,
      orgs.syncOrgs
    ];
    fns.forEach((fn, i) => fn.mockResolvedValue({ id: i }));

    const res = await syncAllEndpoints();

    expect(res).toEqual(fns.map((_, i) => ({ id: i })));
    fns.forEach(fn => expect(fn).toHaveBeenCalled());
  });

  test('handles errors and continues processing', async () => {
    uexTerminals.syncUexTerminals.mockRejectedValue(new Error('fail'));
    manufacturers.syncManufacturers.mockResolvedValue('a');
    vehicles.syncVehicles.mockResolvedValue('b');
    galactapedia.syncGalactapedia.mockResolvedValue('c');
    galactapediaDetail.syncGalactapediaDetails.mockResolvedValue('cd');
    uexVehicles.syncUexVehicles.mockResolvedValue('d');
    uexItemPrices.syncUexItemPrices.mockResolvedValue('e');
    uexCategories.syncUexCategories.mockResolvedValue('f');
    uexCommodityPrices.syncUexCommodityPrices.mockResolvedValue('g');
    uexFuelPrices.syncUexFuelPrices.mockResolvedValue('h');
    uexVehiclePurchasePrices.syncUexVehiclePurchasePrices.mockResolvedValue('i');
    uexVehicleRentalPrices.syncUexVehicleRentalPrices.mockResolvedValue('j');
    uexPois.syncUexPois.mockResolvedValue('k');
    orgs.syncOrgs.mockResolvedValue('l');

    const res = await syncAllEndpoints();

    expect(res[0]).toEqual({ endpoint: 'terminals', success: false, error: 'fail' });
    expect(res.slice(1)).toEqual(['a','b','c','cd','d','e','f','g','h','i','j','k','l']);
    expect(uexTerminals.syncUexTerminals).toHaveBeenCalled();
    expect(uexPois.syncUexPois).toHaveBeenCalled();
  });
});
