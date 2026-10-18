const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { VerifiedUser } = require('../../config/database');
const rsiScrapeOrgMembers = require('../../utils/rsiScrapeOrgMembers');
const getGuildMembersWithRoles = require('../../utils/getGuildMembersWithRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orgstatus')
    .setDescription('Compare RSI org members with verified Discord members and generate a report.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('report')
        .setDescription('Generate the org membership discrepancy report. (Admin only)')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  help: 'Generate a membership report with info about RSI and Discord membership',
  category: 'Admin',
  botPermsReq: ['SendMessages', 'EmbedLinks'],
  async execute(interaction) {
    const guild = interaction.guild;
    const orgId = 'PFCS'; // Replace with your actual org ID

    await interaction.deferReply();

    // Step 1: Scrape RSI Org Members
    const { members: rsiMembers, redactedCount } = await rsiScrapeOrgMembers(orgId);
    const rsiHandles = rsiMembers.map(m => m.handle.toLowerCase());

    // Step 2: Get Verified Users from DB
    // All verified users in the database
    const allVerifiedUsers = await VerifiedUser.findAll();

    // Filter those who are in *your* org
    const verifiedUsers = allVerifiedUsers.filter(v => v.rsiOrgId === orgId);

    // Filter those who are NOT in your org
    const verifiedOutsideOrg = allVerifiedUsers.filter(v => v.rsiOrgId !== orgId);

    const verifiedHandles = verifiedUsers.map(v => v.rsiHandle.toLowerCase());

    // Step 3: Get Discord Members with Target Roles
    const targetRoles = [
        'Deckhand',
        'Corsair',
        'Executive Officer',
        'Captain',
        'Quartermaster',
        'Marshal',
        'Commodore',
        'Retired Executive Officer',
        'Retired Captain'
      ];      
    const roleMembers = await getGuildMembersWithRoles(guild, targetRoles);
    const roleMemberIds = roleMembers.map(m => m.id);
    const verifiedMatchesWithRole = verifiedUsers.filter(v => roleMemberIds.includes(v.discordUserId));
    const verifiedWithoutRole = verifiedUsers.filter(v => !roleMemberIds.includes(v.discordUserId));

    // Step 4: Matchups and Discrepancy Detection
    const verifiedDiscordIds = verifiedUsers.map(v => v.discordUserId);

    const unverifiedRoleMembers = roleMembers.filter(m => !verifiedDiscordIds.includes(m.id));
    const rsiOnlyHandles = rsiHandles.filter(handle => !verifiedHandles.includes(handle));

    // Step 5: Build Report Embed
    const { EmbedBuilder } = require('discord.js');
    const reportEmbed = new EmbedBuilder()
    .setTitle('Org Membership Verification Report')
    .setColor(0x3498db)
    .addFields(
      { name: 'RSI Org Total Public Members', value: `${rsiHandles.length}`, inline: true },
      { name: 'RSI Org Total Redacted Members', value: `${redactedCount}`, inline: true },
      { name: 'Discord Server Total Members', value: `${guild.memberCount}`, inline: true },
      { name: 'Discord Members with PFC Roles', value: `${roleMembers.length}`, inline: true },
      { name: 'Verified PFC Members (with role)', value: `${verifiedMatchesWithRole.length}`, inline: true },
      { name: 'Unverified PFC Members (with role)', value: `${unverifiedRoleMembers.length}`, inline: true },
      { name: 'Verified PFC Members (no PFC role)', value: `${verifiedWithoutRole.length}`, inline: true },
      { name: 'Verified Non-PFC Members', value: `${verifiedOutsideOrg.length}`, inline: true }, // 🆕 Here!
      { name: 'In RSI Org but Not Verified', value: `${rsiOnlyHandles.length}`, inline: true },
    )
    .setTimestamp();

    await interaction.editReply({ embeds: [reportEmbed] });
  }
};
