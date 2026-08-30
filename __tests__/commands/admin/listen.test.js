const { MessageFlags, AttachmentBuilder } = require('discord.js');

jest.mock('fs');

jest.mock('../../../botactions/voice/voiceSessionManager', () => ({
  hasActiveSession: jest.fn(),
  getSession: jest.fn(),
  startListening: jest.fn(),
  stopListening: jest.fn(),
  buildSessionTranscript: jest.fn(),
}));

const fs = require('fs');
const voiceSessionManager = require('../../../botactions/voice/voiceSessionManager');
const { execute } = require('../../../commands/admin/listen');

function createInteraction({
  isAdmin = true,
  sub = 'start',
  voiceChannel = { id: 'vc1', name: 'General', send: jest.fn().mockResolvedValue() },
} = {}) {
  return {
    member: {
      id: 'user1',
      permissions: { has: jest.fn(() => isAdmin) },
      voice: { channel: voiceChannel },
    },
    guild: { id: 'g1' },
    channel: { id: 'tc1', send: jest.fn().mockResolvedValue() },
    options: { getSubcommand: jest.fn(() => sub) },
    reply: jest.fn().mockResolvedValue(),
    deferReply: jest.fn().mockResolvedValue(),
    editReply: jest.fn().mockResolvedValue(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('/listen command', () => {
  it('blocks non-admin users', async () => {
    const interaction = createInteraction({ isAdmin: false });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('administrator'),
      flags: MessageFlags.Ephemeral,
    }));
    expect(voiceSessionManager.startListening).not.toHaveBeenCalled();
    expect(voiceSessionManager.stopListening).not.toHaveBeenCalled();
  });

  describe('start subcommand', () => {
    it('rejects when the member is not in a voice channel', async () => {
      const interaction = createInteraction({ voiceChannel: null });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('voice channel'),
        flags: MessageFlags.Ephemeral,
      }));
      expect(voiceSessionManager.startListening).not.toHaveBeenCalled();
    });

    it('rejects when a session is already active in the guild', async () => {
      voiceSessionManager.hasActiveSession.mockReturnValue(true);
      const interaction = createInteraction();

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('already active'),
        flags: MessageFlags.Ephemeral,
      }));
      expect(voiceSessionManager.startListening).not.toHaveBeenCalled();
    });

    it('starts a session and posts a consent notice to the voice channel\'s own chat', async () => {
      voiceSessionManager.hasActiveSession.mockReturnValue(false);
      voiceSessionManager.startListening.mockResolvedValue({});
      const interaction = createInteraction();
      const voiceChannel = interaction.member.voice.channel;

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(voiceSessionManager.startListening).toHaveBeenCalledWith({
        guild: interaction.guild,
        voiceChannel,
        textChannel: voiceChannel,
        startedByUserId: 'user1',
      });
      expect(voiceChannel.send).toHaveBeenCalledWith(expect.stringContaining('started'));
      expect(interaction.channel.send).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith({ content: '✅ Listening started.' });
    });

    it('reports an error if starting the session fails', async () => {
      voiceSessionManager.hasActiveSession.mockReturnValue(false);
      voiceSessionManager.startListening.mockRejectedValue(new Error('boom'));
      const interaction = createInteraction();

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('Failed to start'),
      }));
    });
  });

  describe('stop subcommand', () => {
    it('rejects when there is no active session', async () => {
      voiceSessionManager.getSession.mockReturnValue(null);
      const interaction = createInteraction({ sub: 'stop' });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('No active listening session'),
        flags: MessageFlags.Ephemeral,
      }));
      expect(voiceSessionManager.stopListening).not.toHaveBeenCalled();
    });

    it('stops the session, attaches the transcript file, and posts a stop notice', async () => {
      const textChannel = { send: jest.fn().mockResolvedValue() };
      voiceSessionManager.getSession.mockReturnValue({ textChannel, dbSessionId: 42 });
      voiceSessionManager.stopListening.mockResolvedValue({});
      voiceSessionManager.buildSessionTranscript.mockResolvedValue('[09:00:00] Alice: hi\n');
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue();
      const interaction = createInteraction({ sub: 'stop' });

      await execute(interaction);

      expect(voiceSessionManager.stopListening).toHaveBeenCalledWith('g1', { stoppedByUserId: 'user1' });
      expect(voiceSessionManager.buildSessionTranscript).toHaveBeenCalledWith(42);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('listen-transcript-session-42.txt'),
        '[09:00:00] Alice: hi\n',
        'utf8',
      );
      expect(textChannel.send).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('stopped'),
        files: [expect.any(AttachmentBuilder)],
      }));
      expect(interaction.editReply).toHaveBeenCalledWith({ content: '✅ Listening stopped.' });
    });

    it('creates the transcript directory when missing', async () => {
      const textChannel = { send: jest.fn().mockResolvedValue() };
      voiceSessionManager.getSession.mockReturnValue({ textChannel, dbSessionId: 7 });
      voiceSessionManager.stopListening.mockResolvedValue({});
      voiceSessionManager.buildSessionTranscript.mockResolvedValue('transcript');
      fs.existsSync.mockReturnValue(false);
      const interaction = createInteraction({ sub: 'stop' });

      await execute(interaction);

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('cleans up the transcript file after sending', async () => {
      jest.useFakeTimers();
      const textChannel = { send: jest.fn().mockResolvedValue() };
      voiceSessionManager.getSession.mockReturnValue({ textChannel, dbSessionId: 42 });
      voiceSessionManager.stopListening.mockResolvedValue({});
      voiceSessionManager.buildSessionTranscript.mockResolvedValue('transcript');
      fs.existsSync.mockReturnValue(true);
      fs.unlink.mockImplementation((p, cb) => cb(null));
      const interaction = createInteraction({ sub: 'stop' });

      await execute(interaction);
      jest.runAllTimers();

      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('listen-transcript-session-42.txt'), expect.any(Function));
      jest.useRealTimers();
    });

    it('logs an error if transcript cleanup fails', async () => {
      jest.useFakeTimers();
      const textChannel = { send: jest.fn().mockResolvedValue() };
      voiceSessionManager.getSession.mockReturnValue({ textChannel, dbSessionId: 42 });
      voiceSessionManager.stopListening.mockResolvedValue({});
      voiceSessionManager.buildSessionTranscript.mockResolvedValue('transcript');
      fs.existsSync.mockReturnValue(true);
      const unlinkErr = new Error('unlink fail');
      fs.unlink.mockImplementation((p, cb) => cb(unlinkErr));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const interaction = createInteraction({ sub: 'stop' });

      await execute(interaction);
      jest.runAllTimers();

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete transcript file'), unlinkErr);
      spy.mockRestore();
      jest.useRealTimers();
    });

    it('reports an error if stopping the session fails', async () => {
      const textChannel = { send: jest.fn().mockResolvedValue() };
      voiceSessionManager.getSession.mockReturnValue({ textChannel, dbSessionId: 42 });
      voiceSessionManager.stopListening.mockRejectedValue(new Error('boom'));
      const interaction = createInteraction({ sub: 'stop' });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('Failed to stop'),
      }));
    });
  });
});
