const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const parseDice = require('../../utils/parseDice');

// The GM's ephemeral reply can only be updated through the original interaction
// object, and the webhook token backing that edit stops working ~15 minutes
// after the command was run. Past that, the check is abandoned instead of
// silently failing when the player finally rolls.
const CHECK_EXPIRY_MS = 14 * 60 * 1000;

// checkId -> { gmInteraction, playerId, dc, reason, createdAt }
// In-memory only: a bot restart between the GM issuing the check and the
// player rolling loses it, same tradeoff as utils/pendingSelections.js.
const pendingChecks = new Map();

function buildRollButton(checkId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`checkdc_roll::${checkId}`)
      .setLabel('🎲 Roll')
      .setStyle(ButtonStyle.Primary)
  );
}

function buildRevealButton(checkId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`checkdc_reveal::${checkId}`)
      .setLabel('📢 Make Public')
      .setStyle(ButtonStyle.Primary)
  );
}

function buildFormulaModal(checkId) {
  const formulaInput = new TextInputBuilder()
    .setCustomId('formula')
    .setLabel('Your roll (formula + any modifiers)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 1d20+5, or 1d20+7 with inspiration folded in')
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`checkdc_modal::${checkId}`)
    .setTitle('Make your roll')
    .addComponents(new ActionRowBuilder().addComponents(formulaInput));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkdc')
    .setDescription('Ask a player to roll a hidden check against a DC — only you see the result')
    .addUserOption(option =>
      option.setName('player')
        .setDescription('The player who must roll')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('dc')
        .setDescription('Difficulty class to beat')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('What the check is for (e.g., Perception, Stealth) — shown to the player')
        .setRequired(false)
    ),

  help: 'Asks a player to roll a hidden dice check against a DC. The player enters their own formula (they know their modifiers, inspiration, etc.) — only you (the GM) see the roll and pass/fail.',
  category: 'Fun',

  async execute(interaction) {
    const player = interaction.options.getUser('player');
    const dc = interaction.options.getInteger('dc');
    const reason = interaction.options.getString('reason');

    await interaction.reply({
      content: `⏳ Waiting for ${player} to roll${reason ? ` (${reason})` : ''}...`,
      flags: MessageFlags.Ephemeral,
    });

    const checkId = interaction.id;
    pendingChecks.set(checkId, {
      gmInteraction: interaction,
      playerId: player.id,
      dc,
      reason,
      createdAt: Date.now(),
    });

    await interaction.channel.send({
      content: `🎲 ${player}, you're being asked to make a check${reason ? ` (**${reason}**)` : ''}. Click below to roll!`,
      components: [buildRollButton(checkId)],
    });
  },

  async button(interaction) {
    const [action, checkId] = interaction.customId.split('::');

    if (action === 'checkdc_reveal') {
      // Ephemeral messages (and their components) are only ever visible/clickable
      // by the GM they were sent to, so no extra ownership check is needed here.
      try {
        await interaction.channel.send({
          content: '📢 Check result revealed:',
          embeds: interaction.message.embeds,
        });
      } catch (err) {
        console.error('❌ Failed to post public check result:', err);
        await interaction.reply({ content: '❌ Failed to post publicly. Please try again.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.update({ components: [] });
      return;
    }

    const check = pendingChecks.get(checkId);

    if (!check) {
      await interaction.reply({ content: '❌ This check has expired or was already resolved.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.user.id !== check.playerId) {
      await interaction.reply({ content: "❌ This roll isn't for you.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(buildFormulaModal(checkId));
  },

  async modal(interaction) {
    const [, checkId] = interaction.customId.split('::');
    const check = pendingChecks.get(checkId);

    if (!check) {
      await interaction.reply({ content: '❌ This check has expired or was already resolved.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.user.id !== check.playerId) {
      await interaction.reply({ content: "❌ This roll isn't for you.", flags: MessageFlags.Ephemeral });
      return;
    }

    const formula = interaction.fields.getTextInputValue('formula');
    let result;
    try {
      result = parseDice(formula);
    } catch (err) {
      console.warn(`⚠️ Rejected dice formula "${formula}" for a /checkdc roll: ${err.message}`);
      // Leave the check pending — the Roll button is still live, so they can try again.
      await interaction.reply({
        content: `❌ ${err.message} Click Roll again to retry.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    pendingChecks.delete(checkId);

    if (Date.now() - check.createdAt > CHECK_EXPIRY_MS) {
      await interaction.reply({ content: '⌛ This check expired before you rolled.', flags: MessageFlags.Ephemeral });
      return;
    }

    const passed = result.total >= check.dc;

    // The player only ever learns the check happened, never the formula's result or the outcome.
    if (interaction.isFromMessage()) {
      await interaction.update({
        content: `🎲 ${interaction.user} made their${check.reason ? ` **${check.reason}**` : ''} check.`,
        components: [],
      });
    } else {
      await interaction.reply({ content: '🎲 Roll submitted.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setColor(passed ? 0x2ecc71 : 0xe74c3c)
      .setTitle(passed ? '✅ Check Passed' : '❌ Check Failed')
      .addFields(
        { name: 'Player', value: `${interaction.user}`, inline: true },
        { name: 'DC', value: `${check.dc}`, inline: true },
        { name: 'Result', value: `**${result.total}**`, inline: true },
        { name: 'Formula', value: `\`${formula}\`` },
        { name: 'Rolls', value: result.rolls.join(', ') }
      )
      .setFooter({ text: check.reason || null })
      .setTimestamp();

    try {
      await check.gmInteraction.editReply({ content: null, embeds: [embed], components: [buildRevealButton(checkId)] });
    } catch (err) {
      console.error('❌ Failed to deliver check result to the GM (their ephemeral session may have expired):', err);
    }
  },

  // Test-only: clears in-memory pending checks between test cases.
  __resetPendingChecksForTests: () => { pendingChecks.clear(); },
};
