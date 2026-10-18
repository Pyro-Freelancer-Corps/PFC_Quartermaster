const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { VerifiedUser, OrgTag } = require('../../config/database');
const { fetchRsiProfileInfo } = require('../../utils/rsiProfileScraper');
const { formatVerifiedNickname } = require('../../utils/formatVerifiedNickname');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manual-verify')
    .setDescription('Manually verify a user by RSI handle (mods & admins).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to verify')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('rsi_handle')
        .setDescription('RSI handle to link')
        .setRequired(true)),
  help: 'Links a Discord user to their RSI profile without requiring a verification code.',
  category: 'Admin',

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({
        content: '❌ Only moderators or administrators can use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    const targetUser = interaction.options.getUser('user');
    const rsiHandle = interaction.options.getString('rsi_handle');

    try {
      const existing = await VerifiedUser.findOne({ where: { rsiHandle } });
      if (existing && existing.discordUserId !== targetUser.id) {
        return interaction.reply({
          content: '❌ This RSI profile is already linked to another Discord user.',
          flags: MessageFlags.Ephemeral
        });
      }

      const { orgId } = await fetchRsiProfileInfo(rsiHandle);
      await VerifiedUser.upsert({
        discordUserId: targetUser.id,
        rsiHandle,
        rsiOrgId: orgId,
        verifiedAt: new Date()
      });

      const tag = orgId ? (await OrgTag.findByPk(orgId.toUpperCase()))?.tag || null : null;
      const member = await interaction.guild.members.fetch(targetUser.id);

      if (orgId === 'PFCS') {
        const recruitRole = interaction.guild.roles.cache.find(r => r.name === 'Recruit');
        const deckhandRole = interaction.guild.roles.cache.find(r => r.name === 'Deckhand');
        const pfcRole = interaction.guild.roles.cache.find(r => r.name === 'Pyro Freelancer Corps');
        if (recruitRole && deckhandRole && member.roles.cache.has(recruitRole.id)) {
          try {
            await member.roles.remove(recruitRole);
            await member.roles.add(deckhandRole);
            await member.roles.add(pfcRole);
          } catch (err) {
            console.warn('[MANUAL VERIFY] Role update failed:', err.message);
          }
        }
      }

      // Always attempt to clean up the nickname using the formatter
      const newNick = formatVerifiedNickname(member.displayName, true, tag);
      if (newNick !== member.displayName) {
        try {
          await member.setNickname(newNick);
        } catch (err) {
          // Nickname updates may fail due to permissions; ignore silently
        }
      }

      await interaction.reply({
        content: `✅ ${targetUser.username} has been manually verified as **${rsiHandle}**.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error('[MANUAL VERIFY] Error:', err);
      await interaction.reply({
        content: '❌ Failed to manually verify user. Try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
