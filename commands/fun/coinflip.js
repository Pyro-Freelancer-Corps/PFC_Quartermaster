const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const HEADS_IMG = 'https://www.wholesalecoinsdirect.com/media/catalog/product/p/r/prod-21morganms70-smint-2021-s-morgan-silver-dollar-obverse-650x650.jpg';
const TAILS_IMG = 'https://www.wholesalecoinsdirect.com/media/catalog/product/p/r/prod-21morganms70-smint-2021-s-morgan-silver-dollar-reverse-650x650.jpg';

let pendingFlips = new Map(); // key: opponentId, value: { challengerId, result, timeout }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin to challenge a user')
    .addSubcommand(sub =>
      sub.setName('challenge')
        .setDescription('Challenge a user to a coin flip')
        .addUserOption(option =>
          option.setName('opponent')
            .setDescription('The user to challenge')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('call')
        .setDescription('Call heads or tails in a coin flip challenge')
        .addStringOption(option =>
          option.setName('choice')
            .setDescription('Heads or Tails')
            .setRequired(true)
            .addChoices(
              { name: 'Heads', value: 'heads' },
              { name: 'Tails', value: 'tails' }
            )
        )
    ),
    help: 'Draws a random playing card for you and another user. Highest card wins!',
    category: 'Fun', 

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'challenge') {
      const challenger = interaction.user;
      const opponent = interaction.options.getUser('opponent');

      const challengerMember = await interaction.guild.members.fetch(challenger.id);
      const opponentMember = await interaction.guild.members.fetch(opponent.id);

      const testerRole = interaction.guild.roles.cache.find(role => role.name === 'Commodore');
      const isSelfChallenge = challenger.id === opponent.id;
      const isAllowedTester = testerRole && challengerMember.roles.cache.has(testerRole.id);

      if (isSelfChallenge && !isAllowedTester) {
        return interaction.reply({
          content: '❌ You can’t challenge yourself unless you’ve got the Commodore role, love.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (pendingFlips.has(opponent.id)) {
        return interaction.reply({
          content: '❌ That user already has a pending coin flip challenge.',
          flags: MessageFlags.Ephemeral
        });
      }

      const result = Math.random() < 0.5 ? 'heads' : 'tails';

      const timeout = setTimeout(() => {
        pendingFlips.delete(opponent.id);
      }, 2 * 60 * 1000); // 2 minutes

      pendingFlips.set(opponent.id, {
        challengerId: challenger.id,
        result,
        timeout,
      });

      return interaction.reply(
        `🪙 **${challengerMember.displayName}** has challenged **${opponentMember.displayName}** to a coin flip!\n` +
        `${opponent}, use \`/coinflip call\` to choose **heads** or **tails**.`
      );
    }

    if (subcommand === 'call') {
      const opponent = interaction.user;
      const choice = interaction.options.getString('choice').toLowerCase();
      const challenge = pendingFlips.get(opponent.id);

      if (!challenge) {
        return interaction.reply({
          content: '❌ You have no pending coin flip challenge.',
          flags: MessageFlags.Ephemeral
        });
      }

      const result = challenge.result;
      const image = result === 'heads' ? HEADS_IMG : TAILS_IMG;

      const challenger = await interaction.client.users.fetch(challenge.challengerId);
      const challengerMember = await interaction.guild.members.fetch(challenger.id);
      const opponentMember = await interaction.guild.members.fetch(opponent.id);

      clearTimeout(challenge.timeout);
      pendingFlips.delete(opponent.id);

      const winner =
        choice === result
          ? `🎉 **${opponentMember.displayName}** wins the toss!`
          : `🎉 **${challengerMember.displayName}** wins the toss!`;

      const embed = new EmbedBuilder()
        .setTitle('🪙 Coin Flip Result')
        .setDescription(
          `The coin landed on **${result.toUpperCase()}**!\n\n${winner}`
        )
        .setThumbnail(image)
        .setColor(0xC0C0C0);

      await interaction.reply({ embeds: [embed] });
    }
  }
};
