const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const chrono = require('chrono-node');
const { pendingChannelSelection } = require('../../utils/pendingSelections');
const { saveAnnouncementToDatabase } = require('../../botactions/scheduling/scheduleHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Schedules an announcement as an embed')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    roles: ['Commodore', 'Marshal'],
    help: 'Opens a modal to schedule a rich embedded announcement for later posting. (Admin Only)',
    category: 'Discord',
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('scheduleModal')
            .setTitle('Schedule Announcement');

        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Embed Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the embed title')
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Embed Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter the embed description')
            .setRequired(true);

        const timeInput = new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Schedule Time')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., tomorrow at 5pm, in 15 minutes')
        .setRequired(true);
    

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(timeInput)
        );

        await interaction.showModal(modal);
    },
    
    option: async function (interaction, client) {
        const selectedChannelId = interaction.values[0];
        const pending = pendingChannelSelection[interaction.user.id];
    
        if (!pending) {
            return interaction.reply({ content: '❌ No pending announcement found.', flags: MessageFlags.Ephemeral });
        }
    
        // Double-check: selectedChannelId should be a string
        if (typeof selectedChannelId !== 'string') {
            console.error('Channel ID is not a string:', selectedChannelId);
            return interaction.reply({ content: '❌ Invalid channel selected.', flags: MessageFlags.Ephemeral });
        }
    
        try {
            console.log('💾 Saving announcement with footer:', pending.author);

            await saveAnnouncementToDatabase(
                selectedChannelId,
                interaction.guild.id,
                {
                    title: pending.title,
                    description: pending.description,
                    author: pending.author
                },
                pending.time,
                client
            );            
    
            delete pendingChannelSelection[interaction.user.id];
            await interaction.reply({ content: '✅ Announcement scheduled successfully!', flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Error saving announcement to database:', error);
            await interaction.reply({ content: '❌ Failed to schedule announcement. Check logs for details.', flags: MessageFlags.Ephemeral });
        }
    }    
};
