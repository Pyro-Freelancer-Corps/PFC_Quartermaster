const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { deleteScheduledAnnouncement } = require('../../botactions/scheduling/scheduleHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deleteannouncement')
        .setDescription('Delete a scheduled announcement')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the announcement to delete')
                .setRequired(true))// Already includes:
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    help: 'Deletes a scheduled announcement by its ID. Only available to Marshals and Commodores. (Admin Only)',
    category: 'Discord',                
    async execute(interaction) {

        const id = interaction.options.getString('id');
        const success = await deleteScheduledAnnouncement(id);

        if (success) {
            await interaction.reply(`Announcement with ID ${id} has been deleted.`);
        } else {
            await interaction.reply(`Announcement with ID ${id} was not found.`);
        }
    },
};
