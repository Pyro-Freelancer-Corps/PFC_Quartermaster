const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Accolade } = require('../../config/database');
const { buildAccoladeEmbed } = require('../../utils/accoladeEmbedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updateaccolade')
    .setDescription('Update the emoji and/or description for an existing accolade.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role associated with the accolade')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('emoji')
        .setDescription('New emoji for the accolade')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('New description for the accolade')
        .setRequired(false)),

  help: 'Admin-only command to update an existing accolade\'s emoji or description.',
  category: 'Admin',

  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const rawEmoji = interaction.options.getString('emoji')?.trim();
    const isValidEmoji = !rawEmoji || /^<a?:\w+:\d+>$|^\p{Extended_Pictographic}$/u.test(rawEmoji);
    
    if (rawEmoji && !isValidEmoji) {
      return interaction.reply({
        content: '❌ Please provide a valid emoji (Unicode or custom Discord emoji).',
        flags: MessageFlags.Ephemeral
      });
    }
    
    const emoji = rawEmoji;
    
    const description = interaction.options.getString('description');

    const accolade = await Accolade.findOne({ where: { role_id: role.id } });

    if (!accolade) {
      return interaction.reply({
        content: '❌ That role is not registered as an accolade.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (!emoji && !description) {
      return interaction.reply({
        content: '⚠️ You must provide at least one field to update (emoji or description).',
        flags: MessageFlags.Ephemeral
      });
    }

    if (emoji) accolade.emoji = emoji;
    if (description) accolade.description = description;
    accolade.date_modified = Math.floor(Date.now() / 1000);
    await accolade.save();

    try {
      const guild = interaction.guild;
      const channel = await guild.channels.fetch(accolade.channel_id);
      if (channel && (channel.type === 0 || channel.type === 'GUILD_TEXT')) {
        await guild.members.fetch();

        const recipients = guild.members.cache
          .filter(member => member.roles.cache.has(accolade.role_id))
          .map(member => member);

        const embed = buildAccoladeEmbed(accolade, recipients, role);
        const oldMessage = await channel.messages.fetch(accolade.message_id).catch(() => null);

        if (oldMessage) {
          await oldMessage.edit({ embeds: [embed], content: '' });
          console.log(`📝 Edited message for ${accolade.name}`);
        } else {
          const newMessage = await channel.send({ embeds: [embed] });
          accolade.message_id = newMessage.id;
          await accolade.save();
          console.log(`📬 Sent new message for ${accolade.name}`);
        }
      }
    } catch (err) {
      console.error('❌ Failed to update accolade message:', err);
    }

    return interaction.reply({
      content: `✅ Accolade **${accolade.name}** has been updated.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
