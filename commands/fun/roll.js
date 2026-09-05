const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const parseDice = require('../../utils/parseDice'); // We'll build this next

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll some dice using standard notation (e.g., 2d20+5)')
    .addStringOption(option =>
      option.setName('formula')
        .setDescription('Dice formula (e.g., d20, 3d6+2, 4d6kh3)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Optional reason for the roll (e.g., initiative, attack, saving throw)')
        .setRequired(false)
    ),

  help: 'Rolls dice using standard D&D-style notation. Supports modifiers and "keep highest/lowest" rules.',
  category: 'Fun',

  async execute(interaction) {
    const formula = interaction.options.getString('formula');
    const reason = interaction.options.getString('reason');

    try {
      const result = parseDice(formula);

      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('🎲 Dice Roll')
        .addFields(
          { name: 'Formula', value: `\`${formula}\``, inline: true },
          { name: 'Result', value: `**${result.total}**`, inline: true },
          { name: 'Rolls', value: result.rolls.join(', ') }
        )
        .setFooter({ text: reason ? `Reason: ${reason}` : null })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (err) {
      console.warn(`⚠️ Rejected dice formula "${formula}": ${err.message}`);
      await interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }
};
