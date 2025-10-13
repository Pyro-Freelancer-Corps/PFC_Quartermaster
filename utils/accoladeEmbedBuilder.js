const { EmbedBuilder } = require('discord.js');

function buildAccoladeEmbed(accolade, recipients, role) {
  const maxFieldLength = 1024;

  const defaultThumbnail = 'https://i.imgur.com/5sZV5QN.png';
  const roleIconUrl = typeof role?.iconURL === 'function' ? role.iconURL() : null;
  const thumbnailUrl = roleIconUrl || accolade.thumbnail_url || defaultThumbnail;
  const footerIcon = accolade.footer_icon_url || 'https://i.imgur.com/5sZV5QN.png';
  const embedColor = accolade.color || 0xD4AF37; // Prestige gold

  // 🏅 Elegant Title: Emoji + Bold Name
  const title = `${accolade.emoji || ''}  **${accolade.name}**`;

  // 📝 Italic Description
  const description = accolade.description
    ? `*${accolade.description.trim()}*`
    : '*No description set.*';

  if (!recipients || recipients.length === 0) {
    return new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(title)
      .setDescription(description)
      .addFields({ name: 'Recipients', value: '_No current recipients_' })
      .setThumbnail(thumbnailUrl)
      .setTimestamp()
      .setFooter({ text: 'PFC Accolade Registry', iconURL: footerIcon });
  }

  const chunkSize = Math.ceil(recipients.length / 3);
  const columns = [[], [], []];

  recipients.forEach((member, index) => {
    const colIndex = Math.floor(index / chunkSize);

    // 🎯 Clean display name: remove [TAGS] and prevent wrap
    const cleanedName = member.displayName.replace(/^[\[\(\{<][^\]\)\}>]+[\]\)\}>]\s*/g, '');
    const noWrapName = cleanedName.replace(/ /g, '\u00A0');

    columns[colIndex].push(`• ${noWrapName}`);
  });

  const fields = columns
    .filter(col => col.length > 0)
    .map(col => ({
      name: '\u200B', // Invisible field title for 3-column layout
      value: col.join('\n').slice(0, maxFieldLength),
      inline: true
    }));

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setThumbnail(thumbnailUrl)
    .setTimestamp()
    .setFooter({ text: 'PFC Accolade Registry', iconURL: footerIcon });
}

module.exports = { buildAccoladeEmbed };
