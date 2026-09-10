// utils/fetchSCData.js
const fetch = require('node-fetch');

const BASE_URL = 'https://api.star-citizen.wiki/api/v2';
const DEFAULT_LIMIT = 50;

async function fetchSCData(endpoint, queryparams = {}) {
  const allData = [];
  let page = 1;
  let hasNext = true;

  // Always start with limit=50 unless caller specifies something else
  const limit = queryparams.limit || DEFAULT_LIMIT;

  try {
    while (hasNext) {
      const params = new URLSearchParams({
        ...queryparams,
        limit,
        page,
      });

      const url = `${BASE_URL}/${endpoint}?${params.toString()}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch page ${page}`);
      }

      const json = await response.json();

      if (!Array.isArray(json.data)) {
        throw new Error(`Expected array in 'data'`);
      }

      allData.push(...json.data);

      // The wiki API keeps handing back a non-null links.next even past the
      // final page, so it can never be trusted on its own to end the loop -
      // doing so walked past meta.last_page until a request happened to fail.
      // Prefer an empty page, then meta.last_page, and only fall back to
      // links.next when the response carries no pagination metadata.
      const lastPage = Number(json.meta?.last_page);

      if (json.data.length === 0) {
        hasNext = false;
      } else if (Number.isFinite(lastPage) && lastPage > 0) {
        hasNext = page < lastPage;
      } else {
        hasNext = Boolean(json.links?.next);
      }

      page++;
    }

    return allData;

  } catch (err) {
    console.error(`[FETCH ERROR] ${err.message}`);

    // Returning [] on failure reads to callers as "synced nothing,
    // successfully" - they only check Array.isArray - which silently threw
    // away every page fetched before the error. Keep the partial results, and
    // let a total failure surface as an error the sync step can report.
    if (allData.length === 0) {
      throw err;
    }

    console.warn(
      `[FETCH WARNING] ${endpoint}: returning ${allData.length} partial record(s) after failure on page ${page}`
    );
    return allData;
  }
}

async function fetchSCDataByUrl(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

module.exports = {
  fetchSCData
  ,fetchSCDataByUrl
};
