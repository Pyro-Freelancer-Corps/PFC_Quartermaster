const {
    syncManufacturers,
    syncUexTerminals,
    syncVehicles,
    syncGalactapedia,
    syncGalactapediaDetails,
    syncUexVehicles,
    syncUexItemPrices,
    syncUexCategories,
    syncUexCommodityPrices,
    syncUexFuelPrices,
    syncUexVehiclePurchasePrices,
    syncUexVehicleRentalPrices,
    syncUexPois,
    syncOrgs,
  } = require('../../botactions/api/syncEndpoints');

  const { EmbedBuilder } = require('discord.js');

    
    function formatResultTable(results) {
      const pad = (s, len) => String(s).padEnd(len, ' ');
      const colWidths = [18, 6, 8, 8, 6];
      const headers = ['Endpoint', 'New', 'Updated', 'Skipped', 'Total'];
      const headerRow = headers.map((h, i) => pad(h, colWidths[i])).join('| ');
      const dividerRow = colWidths.map(w => '-'.repeat(w)).join('| ');
    
      const rows = Object.entries(results).map(([label, res]) => {
        const { created = 0, updated = 0, skipped = 0, total = 0, error } = res;
        return [
          label,
          error ? 'ERR' : created,
          error ? 'ERR' : updated,
          error ? 'ERR' : skipped,
          error ? 'ERR' : total
        ].map((val, i) => pad(val, colWidths[i])).join('| ');
      });
    
      return ['```', headerRow, dividerRow, ...rows, '```'].join('\n');
    }
    
    async function runFullApiSync(interaction = null) {
      const results = {};
      const embed = new EmbedBuilder()
        .setColor(0x00ff99)
        .setTitle('🔄 API Sync In Progress')
        .setDescription('Starting sync...')
        .setTimestamp();
    
      if (interaction) {
        await interaction.editReply({ embeds: [embed] });
      }
    
      const updateStep = async (label, fn) => {
        try {
          results[label] = await fn();
        } catch (err) {
          console.error(`[SYNC ERROR] ${label}:`, err);
          results[label] = { error: true };
        }
    
        if (interaction) {
          embed.setDescription(formatResultTable(results));
          await interaction.editReply({ embeds: [embed] });
        } else {
          console.log(`[SYNC] ${label} completed`);
        }
      };
    
      await updateStep('Shops', syncUexTerminals);
      await updateStep('Manufacturers', syncManufacturers);
      await updateStep('Galactapedia', syncGalactapedia);
      await updateStep('Galactapedia Details', syncGalactapediaDetails);
      await updateStep('Vehicles (wiki)', syncVehicles);
      await updateStep('Vehicles (uex)', syncUexVehicles);
      await updateStep('Items', syncUexItemPrices);
      await updateStep('Categories', syncUexCategories);
      await updateStep('Commodities', syncUexCommodityPrices);
      await updateStep('Fuel', syncUexFuelPrices);
      await updateStep('Vehicle Prices', syncUexVehiclePurchasePrices);
      await updateStep('Vehicle Rentals', syncUexVehicleRentalPrices);
      await updateStep('Points of Interest', syncUexPois);
      await updateStep('Organizations', syncOrgs);
    
      if (interaction) {
        embed.setTitle('✅ API Sync Complete').setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } else {
        console.log('[SYNC] API sync completed');
      }
    
      return results;

}
    module.exports = { runFullApiSync };