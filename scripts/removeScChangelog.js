require('dotenv').config();

const { ScChangelogEntry } = require('../config/database');

async function removeScChangelog(versionFrom, versionTo) {
  return ScChangelogEntry.destroy({ where: { versionFrom, versionTo } });
}

async function main() {
  const [versionFrom, versionTo] = process.argv.slice(2);
  if (!versionFrom || !versionTo) {
    console.error('Usage: node scripts/removeScChangelog.js <versionFrom> <versionTo>');
    process.exit(1);
  }

  console.log(`[SC CHANGELOG] Removing ${versionFrom} -> ${versionTo} (BOT_TYPE=${process.env.BOT_TYPE || 'development'})`);

  try {
    const count = await removeScChangelog(versionFrom, versionTo);
    console.log(`[SC CHANGELOG] Removed ${count} entries for ${versionFrom} -> ${versionTo}`);
    process.exit(0);
  } catch (err) {
    console.error('[SC CHANGELOG] Remove failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { removeScChangelog };
