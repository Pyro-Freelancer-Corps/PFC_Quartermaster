function toArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  return Object.values(collection);
}

async function fetchGuildMembers(guild, { batchSize = 1000, maxBatches = 200 } = {}) {
  if (!guild?.members?.fetch) {
    return [];
  }

  const collected = [];
  let after;

  for (let batch = 0; batch < maxBatches; batch++) {
    const options = { limit: batchSize };
    if (after) options.after = after;

    let fetched;
    try {
      fetched = await guild.members.fetch(options);
    } catch (error) {
      console.error('❌ Failed to fetch member batch:', error);
      break;
    }

    const chunk = toArray(fetched);
    if (!chunk.length) break;

    chunk.sort((a, b) => {
      const aId = BigInt(a.id);
      const bId = BigInt(b.id);
      if (aId === bId) return 0;
      return aId < bId ? -1 : 1;
    });

    collected.push(...chunk);

    if (chunk.length < batchSize) break;
    after = chunk[chunk.length - 1]?.id;
  }

  if (!collected.length && guild.members.cache?.size) {
    return toArray(guild.members.cache);
  }

  return collected;
}

module.exports = {
  fetchGuildMembers,
  _private: { toArray }
};
