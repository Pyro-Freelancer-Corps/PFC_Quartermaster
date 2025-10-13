const { Accolade } = require('../../config/database');
const { buildAccoladeEmbed } = require('../../utils/accoladeEmbedBuilder');

async function refreshAccoladeEmbeds(client) {
  const guildId = client?.config?.guildId;

  if (!guildId) {
    console.warn('�s��,? Cannot refresh accolades without a configured guildId.');
    return;
  }

  const guild = await client.guilds.fetch(guildId).catch(error => {
    console.error('�?O Failed to fetch guild for accolade refresh:', error);
    return null;
  });

  if (!guild) {
    return;
  }

  const accolades = await Accolade.findAll().catch(error => {
    console.error('�?O Failed to load accolades for refresh:', error);
    return [];
  });

  if (accolades.length === 0) {
    return;
  }

  await Promise.allSettled([guild.members.fetch(), guild.roles.fetch()]);

  for (const accolade of accolades) {
    try {
      const channel = await guild.channels.fetch(accolade.channel_id).catch(() => null);
      if (!channel || (channel.type !== 0 && channel.type !== 'GUILD_TEXT')) {
        console.warn(`�s��,? Skipping accolade ${accolade.name}: target channel unavailable or not text-based.`);
        continue;
      }

      const role = guild.roles.cache.get(accolade.role_id) || await guild.roles.fetch(accolade.role_id).catch(() => null);
      if (!role) {
        console.warn(`�s��,? Skipping accolade ${accolade.name}: associated role missing.`);
        continue;
      }

      const recipients = guild.members.cache
        .filter(member => member.roles.cache.has(accolade.role_id))
        .map(member => member);

      const embed = buildAccoladeEmbed(accolade, recipients, role);

      const existingMessage = accolade.message_id
        ? await channel.messages.fetch(accolade.message_id).catch(() => null)
        : null;

      if (existingMessage) {
        await existingMessage.edit({ embeds: [embed], content: '' });
        console.log(`dY"? Refreshed accolade message for: ${accolade.name}`);
      } else {
        const newMessage = await channel.send({ embeds: [embed] });
        accolade.message_id = newMessage.id;
        console.log(`dY"� Posted new accolade message for: ${accolade.name}`);
      }

      accolade.date_modified = Math.floor(Date.now() / 1000);
      await accolade.save();
    } catch (error) {
      console.error(`�?O Failed to refresh accolade ${accolade.name}:`, error);
    }
  }
}

module.exports = { refreshAccoladeEmbeds };

