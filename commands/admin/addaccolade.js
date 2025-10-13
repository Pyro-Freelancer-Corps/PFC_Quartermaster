const { Accolade } = require('../../config/database');
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildAccoladeEmbed } = require('../../utils/accoladeEmbedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addaccolade')
    .setDescription('Register a role as an accolade and post it to the Wall of Fame.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option => 
      option.setName('role')
        .setDescription('The role to designate as an accolade')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('emoji')
        .setDescription('Emoji for the accolade')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Write-up or explanation for the accolade')
        .setRequired(false)),
  help: 'Registers a role as an accolade and posts it to the Wall of Fame. Includes optional emoji and description. Only members with the role will be shown. This is typically used to spotlight achievements or honors.',
  category: 'Admin',
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Only administrators can use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    const role = interaction.options.getRole('role');
    const rawEmoji = interaction.options.getString('emoji')?.trim() || '';
    const isValidEmoji = /^<a?:\w+:\d+>$|^\p{Extended_Pictographic}$/u.test(rawEmoji);
    
    if (rawEmoji && !isValidEmoji) {
      return interaction.reply({
        content: '❌ Please provide a valid emoji (Unicode or custom Discord emoji).',
        flags: MessageFlags.Ephemeral
      });
    }
    
    const emoji = rawEmoji;
    
    const description = interaction.options.getString('description') || 'No description provided.';
    const guild = interaction.guild;

    const existing = await Accolade.findOne({ where: { role_id: role.id } });
    if (existing) {
      return interaction.reply({ content: 'That role is already registered as an accolade.', flags: MessageFlags.Ephemeral });
    }

    const config = require('../../config.json');
    const channelId = config.wallOfFameChannelId;
    const channel = await guild.channels.fetch(channelId);

    if (!channel || (channel.type !== 0 && channel.type !== 'GUILD_TEXT')) {
      return interaction.reply({
        content: '❌ The configured Wall of Fame channel is either missing or not text-based.',
        flags: MessageFlags.Ephemeral
      });
    }

    await guild.members.fetch(); // Refresh member cache

    const roleMembers = guild.members.cache
      .filter(member => member.roles.cache.has(role.id))
      .map(member => member); // Pass full member objects

    // Build the embed using shared builder
    const tempAccolade = {
      name: role.name,
      emoji,
      description
    };

    const embed = buildAccoladeEmbed(tempAccolade, roleMembers, role);
    const message = await channel.send({ embeds: [embed] }); // ✅ Embed only, no duplicate text

    await Accolade.create({
      role_id: role.id,
      name: role.name,
      emoji,
      description,
      message_id: message.id,
      channel_id: channel.id,
      date_added: Math.floor(Date.now() / 1000),
    });

    return interaction.reply({ content: `✅ Accolade **${role.name}** registered and posted to the Wall of Fame!`, flags: MessageFlags.Ephemeral });
  }
};
