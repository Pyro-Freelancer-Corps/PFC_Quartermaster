const { syncAllEndpoints } = require('../../../botactions/api/syncEndpoints');

jest.mock('../../../utils/apiSync/manufacturers', () => ({ syncManufacturers: jest.fn() }));
jest.mock('../../../utils/apiSync/vehicles', () => ({ syncVehicles: jest.fn() }));
jest.mock('../../../utils/apiSync/galactapedia', () => ({ syncGalactapedia: jest.fn() }));
jest.mock('../../../utils/apiSync/galactapediaDetail', () => ({ syncGalactapediaDetails: jest.fn() }));
jest.mock('../../../utils/apiSync/orgs', () => ({ syncOrgs: jest.fn() }));

const manufacturers = require('../../../utils/apiSync/manufacturers');
const vehicles = require('../../../utils/apiSync/vehicles');
const galactapedia = require('../../../utils/apiSync/galactapedia');
const galactapediaDetail = require('../../../utils/apiSync/galactapediaDetail');
const orgs = require('../../../utils/apiSync/orgs');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('syncAllEndpoints', () => {
  test('returns results from all sync functions in order', async () => {
    const fns = [
      manufacturers.syncManufacturers,
      vehicles.syncVehicles,
      galactapedia.syncGalactapedia,
      galactapediaDetail.syncGalactapediaDetails,
      orgs.syncOrgs
    ];
    fns.forEach((fn, i) => fn.mockResolvedValue({ id: i }));

    const res = await syncAllEndpoints();

    expect(res).toEqual(fns.map((_, i) => ({ id: i })));
    fns.forEach(fn => expect(fn).toHaveBeenCalled());
  });

  test('handles errors and continues processing', async () => {
    manufacturers.syncManufacturers.mockRejectedValue(new Error('fail'));
    vehicles.syncVehicles.mockResolvedValue('b');
    galactapedia.syncGalactapedia.mockResolvedValue('c');
    galactapediaDetail.syncGalactapediaDetails.mockResolvedValue('cd');
    orgs.syncOrgs.mockResolvedValue('l');

    const res = await syncAllEndpoints();

    expect(res[0]).toEqual({ endpoint: 'manufacturers', success: false, error: 'fail' });
    expect(res.slice(1)).toEqual(['b', 'c', 'cd', 'l']);
    expect(manufacturers.syncManufacturers).toHaveBeenCalled();
    expect(orgs.syncOrgs).toHaveBeenCalled();
  });
});
