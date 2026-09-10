const { syncManufacturers } = require('../../utils/apiSync/manufacturers');
const { syncVehicles } = require('../../utils/apiSync/vehicles');
const { syncGalactapedia } = require('../../utils/apiSync/galactapedia');
const { syncGalactapediaDetails } = require('../../utils/apiSync/galactapediaDetail');
const { syncUexVehicles } = require('../../utils/apiSync/syncUexVehicles');
const { syncUexTerminals } = require('../../utils/apiSync/syncUexTerminals');
const { syncUexItemPrices } = require('../../utils/apiSync/syncUexItemPrices');
const { syncUexCategories } = require('../../utils/apiSync/syncUexCategories');
const { syncUexCommodityPrices } = require('../../utils/apiSync/syncUexCommodityPrices');
const { syncUexFuelPrices } = require('../../utils/apiSync/syncUexFuelPrices');
const { syncUexVehiclePurchasePrices } = require('../../utils/apiSync/syncUexVehiclePurchasePrices');
const { syncUexVehicleRentalPrices } = require('../../utils/apiSync/syncUexVehicleRentalPrices');
const { syncUexPois } = require('../../utils/apiSync/syncUexPoi');
const { syncOrgs } = require('../../utils/apiSync/orgs');

async function syncAllEndpoints() {
  const results = [];

  try{
    const  syncUexTerminalResult = await syncUexTerminals();
    results.push(syncUexTerminalResult);
  } catch (error) {
    results.push({ endpoint: 'terminals', success: false, error: error.message });
  }
  
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

  try{
    const  syncUexVehicleResult = await syncUexVehicles();
    results.push(syncUexVehicleResult);
  } catch (error) {
    results.push({ endpoint: 'vehicles', success: false, error: error.message });
  }

  try {
    const syncUexItemPriceResult = await syncUexItemPrices();
    results.push(syncUexItemPriceResult);
  }catch (error){
    results.push({endpoint: 'items_prices_all', success: false, error: error.message });
  }

  try {
    const syncUexCategoryResult = await syncUexCategories();
    results.push(syncUexCategoryResult);
  }catch (error){
    results.push({endpoint: 'categories', success: false, error: error.message });
  }

  try {
    const syncUexCommodityPriceResult = await syncUexCommodityPrices();
    results.push(syncUexCommodityPriceResult);
  }catch (error){
    results.push({endpoint: 'commodities_prices_all', success: false, error: error.message });
  }

  try {
    const syncUexFuelPriceResult = await syncUexFuelPrices();
    results.push(syncUexFuelPriceResult);
  }catch (error){
    results.push({endpoint: 'fuel_prices_all', success: false, error: error.message });
  }

  try {
    const syncUexVehiclePurchacePriceResult = await syncUexVehiclePurchasePrices();
    results.push(syncUexVehiclePurchacePriceResult);
  }catch (error){
    results.push({endpoint: 'vehicle_purchase_prices_all', success: false, error: error.message });
  }

  try {
    const syncUexVehicleRentalPriceResult = await syncUexVehicleRentalPrices();
    results.push(syncUexVehicleRentalPriceResult);
  }catch (error){
    results.push({endpoint: 'vehicle_rental_prices_all', success: false, error: error.message });
  }

  try {
    const syncUexPoiResult = await syncUexPois();
    results.push(syncUexPoiResult);
  }catch (error){
    results.push({endpoint: 'poi', success: false, error: error.message });
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
};
