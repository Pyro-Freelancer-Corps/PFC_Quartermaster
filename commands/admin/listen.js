const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const voiceSessionManager = require('../../botactions/voice/voiceSessionManager');

const TRANSCRIPT_DIR = path.join(__dirname, '..', '..', 'logs', 'listen-transcripts');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('listen')
    .setDescription('Join your voice channel and transcribe speech to text. (Admin only)')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start listening and transcribing in your current voice channel')
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Stop the active listening session in this server')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  help: 'Joins your voice channel, transcribes speech locally, and posts a live transcript. Admin only.',
  category: 'Admin',

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Only an administrator can do that. Your attempt has been logged.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'start') {
      const voiceChannel = interaction.member.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: '⚠️ You must be in a voice channel to start listening.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.channel.id === interaction.client.chanBotLog) {
        return interaction.reply({
          content: '⚠️ This is the bot\'s activity log channel — a live transcript here would be buried by log spam. Run `/listen start` in the channel you actually want to watch.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (voiceSessionManager.hasActiveSession(guild.id)) {
        return interaction.reply({
          content: '⚠️ A listening session is already active in this server.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        await voiceSessionManager.startListening({
          guild,
          voiceChannel,
          textChannel: interaction.channel,
          startedByUserId: interaction.member.id
        });

        await interaction.channel.send(
          `📢 **Voice transcription started** by <@${interaction.member.id}> in **${voiceChannel.name}**. ` +
          'Recording and transcribing until stopped with `/listen stop`.'
        );

        await interaction.editReply({ content: '✅ Listening started.' });
      } catch (error) {
        console.error('❌ Error starting listen session:', error);
        await interaction.editReply({ content: '❌ Failed to start the listening session.' });
      }

    } else if (sub === 'stop') {
      const session = voiceSessionManager.getSession(guild.id);
      if (!session) {
        return interaction.reply({
          content: '⚠️ No active listening session in this server.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const textChannel = session.textChannel;
        const dbSessionId = session.dbSessionId;

        await voiceSessionManager.stopListening(guild.id, { stoppedByUserId: interaction.member.id });

        const transcriptText = await voiceSessionManager.buildSessionTranscript(dbSessionId);

        if (!fs.existsSync(TRANSCRIPT_DIR)) {
          fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
        }

        const filename = `listen-transcript-session-${dbSessionId}.txt`;
        const filepath = path.join(TRANSCRIPT_DIR, filename);
        fs.writeFileSync(filepath, transcriptText, 'utf8');

        const attachment = new AttachmentBuilder(filepath);
        await textChannel.send({
          content: `🛑 **Voice transcription stopped** by <@${interaction.member.id}>.`,
          files: [attachment]
        });

        setTimeout(() => {
          fs.unlink(filepath, (err) => {
            if (err) console.error(`⚠️ Failed to delete transcript file ${filename}:`, err);
          });
        }, 10000);

        await interaction.editReply({ content: '✅ Listening stopped.' });
      } catch (error) {
        console.error('❌ Error stopping listen session:', error);
        await interaction.editReply({ content: '❌ Failed to stop the listening session.' });
      }
    }
  }
};
