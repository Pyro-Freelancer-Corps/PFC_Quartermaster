// utils/apiSync/galactapediaDetail.js
const { fetchSCDataByUrl } = require('../../utils/fetchSCData');
const {
  GalactapediaEntry,
  GalactapediaDetail,
  GalactapediaCategory,
  GalactapediaTag,
  GalactapediaProperty,
  GalactapediaRelatedArticle
} = require('../../config/database');

// Discord embed descriptions cap at 4096 characters, and /galactapedia renders
// detail.content directly without trimming. Store it pre-trimmed to match what
// the command writes when it fetches a detail on demand.
const MAX_CONTENT = 4000;

// A full backfill is ~1500 requests against the wiki API, so each scheduled run
// takes a bounded slice of the entries that still have no detail row.
const DEFAULT_BATCH = 200;
const REQUEST_DELAY_MS = 250;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function syncGalactapediaDetail(entry) {
  const { api_url, id } = entry;

  try {
    const result = await fetchSCDataByUrl(api_url);
    const data = result?.data;

    if (!data || !data.translations?.en_EN) {
      throw new Error(`No detail content for ${id}`);
    }

    await GalactapediaDetail.upsert({
      entry_id: id,
      content: data.translations.en_EN.trim().slice(0, MAX_CONTENT),
      created_at: data.created_at ?? null,
      updated_at: new Date()
    });

    await GalactapediaCategory.destroy({ where: { entry_id: id } });
    await GalactapediaTag.destroy({ where: { entry_id: id } });
    await GalactapediaProperty.destroy({ where: { entry_id: id } });
    await GalactapediaRelatedArticle.destroy({ where: { entry_id: id } });

    const categories = (data.categories || []).map(category => ({
      entry_id: id,
      category_id: category.id,
      category_name: category.name
    }));
    if (categories.length) await GalactapediaCategory.bulkCreate(categories);

    const tags = (data.tags || []).map(tag => ({
      entry_id: id,
      tag_id: tag.id,
      tag_name: tag.name
    }));
    if (tags.length) await GalactapediaTag.bulkCreate(tags);

    // The v2 detail endpoint no longer returns properties or related_articles
    // (only related_articles_count). These are kept so the tables repopulate on
    // their own if the API starts returning them again.
    const properties = (data.properties || []).map(property => ({
      entry_id: id,
      name: property.name,
      value: property.value
    }));
    if (properties.length) await GalactapediaProperty.bulkCreate(properties);

    const related = (data.related_articles || []).map(article => ({
      entry_id: id,
      related_id: article.id,
      title: article.title,
      url: article.url,
      api_url: article.api_url
    }));
    if (related.length) await GalactapediaRelatedArticle.bulkCreate(related);

    return true;
  } catch (err) {
    console.error(`[SYNC ERROR] Failed to sync galactapedia detail for ${id}:`, err);
    return false;
  }
}

async function syncGalactapediaDetails({ limit = DEFAULT_BATCH, delayMs = REQUEST_DELAY_MS } = {}) {
  console.log('[API SYNC] Syncing Galactapedia details...');

  let created = 0;
  let skipped = 0;

  try {
    const existing = await GalactapediaDetail.findAll({ attributes: ['entry_id'], raw: true });
    const haveDetail = new Set(existing.map(row => row.entry_id));

    const entries = await GalactapediaEntry.findAll({ attributes: ['id', 'api_url'], raw: true });
    const pending = entries.filter(entry => entry.api_url && !haveDetail.has(entry.id));
    const batch = pending.slice(0, limit);

    for (const entry of batch) {
      const ok = await syncGalactapediaDetail(entry);
      ok ? created++ : skipped++;
      if (delayMs) await sleep(delayMs);
    }

    const remaining = pending.length - batch.length;
    console.log(
      `[API SYNC] Synced Galactapedia details - Created: ${created}, Skipped: ${skipped}, Remaining: ${remaining}`
    );

    return { created, updated: 0, skipped, total: batch.length, remaining };
  } catch (err) {
    console.error('[API SYNC] Error syncing Galactapedia details:', err);
    throw err;
  }
}

module.exports = { syncGalactapediaDetail, syncGalactapediaDetails };
