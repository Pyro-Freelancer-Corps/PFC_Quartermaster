const { syncManufacturers } = require('../../utils/apiSync/manufacturers');
const { syncVehicles } = require('../../utils/apiSync/vehicles');
const { syncGalactapedia } = require('../../utils/apiSync/galactapedia');
const { syncGalactapediaDetails } = require('../../utils/apiSync/galactapediaDetail');
const { syncOrgs } = require('../../utils/apiSync/orgs');

async function syncAllEndpoints() {
  const results = [];

  try {
    const manufacturerResult = await syncManufacturers();
    results.push(manufacturerResult);
  } catch (error) {
    results.push({ endpoint: 'manufacturers', success: false, error: error.message });
  }

  try {
    const vehicleResult = await syncVehicles();
    results.push(vehicleResult);
  } catch (error) {
    results.push({ endpoint: 'vehicles', success: false, error: error.message });
  }

  try {
    const galactapediaResult = await syncGalactapedia();
    results.push(galactapediaResult);
  } catch (error) {
    results.push({ endpoint: 'galactapedia', success: false, error: error.message });
  }

  try {
    const galactapediaDetailResult = await syncGalactapediaDetails();
    results.push(galactapediaDetailResult);
  } catch (error) {
    results.push({ endpoint: 'galactapedia-details', success: false, error: error.message });
  }

  try {
    const syncOrgResult = await syncOrgs();
    results.push(syncOrgResult);
  } catch (error) {
    results.push({ endpoint: 'orgs', success: false, error: error.message });
  }

  return results;
}

module.exports = {
    syncAllEndpoints,
    syncManufacturers,
    syncVehicles,
    syncGalactapedia,
    syncGalactapediaDetails,
    syncOrgs
};
