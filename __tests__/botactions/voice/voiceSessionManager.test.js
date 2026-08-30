const { EventEmitter } = require('events');

jest.mock('@discordjs/voice', () => ({
  joinVoiceChannel: jest.fn(),
  entersState: jest.fn(),
  VoiceConnectionStatus: {
    Ready: 'ready',
    Disconnected: 'disconnected',
    Signalling: 'signalling',
    Connecting: 'connecting',
  },
  EndBehaviorType: { AfterSilence: 'afterSilence' },
}));

jest.mock('prism-media', () => ({
  opus: { Decoder: jest.fn() },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const mockOfflineRecognizer = jest.fn();
jest.mock('sherpa-onnx-node', () => ({
  OfflineRecognizer: mockOfflineRecognizer,
}));

jest.mock('../../../config/database', () => ({
  ListenSession: { create: jest.fn(), update: jest.fn() },
  ListenUtterance: { create: jest.fn(), findAll: jest.fn() },
}));

const fs = require('fs');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const prism = require('prism-media');
const { ListenSession, ListenUtterance } = require('../../../config/database');
const voiceSessionManager = require('../../../botactions/voice/voiceSessionManager');

const flush = () => new Promise((resolve) => setImmediate(resolve));

function makeConnection() {
  return {
    receiver: { speaking: { on: jest.fn() }, subscribe: jest.fn() },
    on: jest.fn(),
    destroy: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  voiceSessionManager.__resetRecognizerForTests();
  fs.existsSync.mockReturnValue(true);
});

describe('downsampleTo16kMono', () => {
  it('downmixes stereo to mono, low-pass filters, and decimates 48kHz to 16kHz', () => {
    const totalFrames = 9; // divisible by the 3x decimation factor
    const buf = Buffer.alloc(totalFrames * 4); // stereo, 16-bit (4 bytes/frame)
    for (let i = 0; i < totalFrames; i++) {
      buf.writeInt16LE(8192, i * 4);
      buf.writeInt16LE(8192, i * 4 + 2);
    }

    const samples = voiceSessionManager.downsampleTo16kMono(buf);

    expect(samples).toBeInstanceOf(Float32Array);
    expect(samples.length).toBe(3);
    samples.forEach((sample) => expect(sample).toBeCloseTo(0.25, 5));
  });
});

describe('pcmDurationMs', () => {
  it('computes duration from raw 48kHz stereo PCM byte length', () => {
    expect(voiceSessionManager.pcmDurationMs(192000)).toBeCloseTo(1000);
    expect(voiceSessionManager.pcmDurationMs(96000)).toBeCloseTo(500);
  });
});

describe('getRecognizer / transcribeUtterance', () => {
  let fakeRecognizer;

  beforeEach(() => {
    fakeRecognizer = {
      createStream: jest.fn(() => ({ acceptWaveform: jest.fn() })),
      decode: jest.fn(),
      getResult: jest.fn(() => ({ text: 'hello world' })),
    };
    mockOfflineRecognizer.mockImplementation(() => fakeRecognizer);
  });

  it('throws a clear error naming the missing model file', () => {
    fs.existsSync.mockReturnValue(false);

    expect(() => voiceSessionManager.getRecognizer()).toThrow(/model file missing/i);
    expect(mockOfflineRecognizer).not.toHaveBeenCalled();
  });

  it('constructs the recognizer only once across repeated calls', () => {
    voiceSessionManager.getRecognizer();
    voiceSessionManager.getRecognizer();

    expect(mockOfflineRecognizer).toHaveBeenCalledTimes(1);
  });

  it('downsamples, decodes, and returns trimmed text', async () => {
    fakeRecognizer.getResult.mockReturnValue({ text: '  hello there  ' });

    const text = await voiceSessionManager.transcribeUtterance(Buffer.alloc(1200));

    expect(fakeRecognizer.createStream).toHaveBeenCalled();
    expect(fakeRecognizer.decode).toHaveBeenCalled();
    expect(text).toBe('hello there');
  });

  it('serializes overlapping transcription calls', async () => {
    const order = [];
    fakeRecognizer.decode.mockImplementation(() => order.push('decode'));

    const first = voiceSessionManager.transcribeUtterance(Buffer.alloc(1200));
    const second = voiceSessionManager.transcribeUtterance(Buffer.alloc(1200));

    await Promise.all([first, second]);

    expect(order).toEqual(['decode', 'decode']);
    expect(fakeRecognizer.decode).toHaveBeenCalledTimes(2);
  });

  it('rejects without crashing when the recognizer throws', async () => {
    fs.existsSync.mockReturnValue(false);

    await expect(voiceSessionManager.transcribeUtterance(Buffer.alloc(1200))).rejects.toThrow(/model file missing/i);

    // the queue must recover for subsequent calls
    fs.existsSync.mockReturnValue(true);
    fakeRecognizer.getResult.mockReturnValue({ text: 'recovered' });
    await expect(voiceSessionManager.transcribeUtterance(Buffer.alloc(1200))).resolves.toBe('recovered');
  });
});

describe('captureUtterance', () => {
  function makeSession() {
    return {
      guild: { members: { fetch: jest.fn().mockResolvedValue({ displayName: 'Tester', user: { username: 'tester' } }) } },
      connection: { receiver: { subscribe: jest.fn() } },
      textChannel: { send: jest.fn().mockResolvedValue() },
      dbSessionId: 42,
      activeSubscriptions: new Map(),
      utteranceSeq: 0,
    };
  }

  function wireDecoder(session, userId) {
    const decoder = new EventEmitter();
    prism.opus.Decoder.mockImplementation(() => decoder);
    session.connection.receiver.subscribe.mockReturnValue({ on: jest.fn(), pipe: jest.fn() });
    voiceSessionManager.captureUtterance(session, userId);
    return decoder;
  }

  beforeEach(() => {
    mockOfflineRecognizer.mockImplementation(() => ({
      createStream: jest.fn(() => ({ acceptWaveform: jest.fn() })),
      decode: jest.fn(),
      getResult: jest.fn(() => ({ text: 'Hello world' })),
    }));
  });

  it('discards utterances shorter than MIN_UTTERANCE_MS without transcribing', async () => {
    const session = makeSession();
    const decoder = wireDecoder(session, 'user1');

    decoder.emit('data', Buffer.alloc(10));
    decoder.emit('end');
    await flush();

    expect(mockOfflineRecognizer).not.toHaveBeenCalled();
    expect(session.textChannel.send).not.toHaveBeenCalled();
    expect(ListenUtterance.create).not.toHaveBeenCalled();
  });

  it('transcribes, posts, and persists utterances at or above the threshold', async () => {
    const session = makeSession();
    const decoder = wireDecoder(session, 'user1');

    decoder.emit('data', Buffer.alloc(120000));
    decoder.emit('end');
    await flush();

    expect(session.textChannel.send).toHaveBeenCalledWith('**Tester:** Hello world');
    expect(ListenUtterance.create).toHaveBeenCalledWith(expect.objectContaining({
      session_id: 42,
      user_id: 'user1',
      username: 'Tester',
      sequence: 1,
      content: 'Hello world',
    }));
  });

  it('logs and does not crash the session if transcription fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fs.existsSync.mockReturnValue(false);
    const session = makeSession();
    const decoder = wireDecoder(session, 'user1');

    decoder.emit('data', Buffer.alloc(120000));
    decoder.emit('end');
    await flush();

    expect(session.textChannel.send).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('does not double-subscribe a user already being captured', () => {
    const session = makeSession();
    session.connection.receiver.subscribe.mockReturnValue({ on: jest.fn(), pipe: jest.fn() });
    prism.opus.Decoder.mockImplementation(() => new EventEmitter());

    voiceSessionManager.captureUtterance(session, 'user1');
    voiceSessionManager.captureUtterance(session, 'user1');

    expect(session.connection.receiver.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe('startListening', () => {
  const guild = { id: 'guild-start-1', voiceAdapterCreator: 'adapter' };
  const voiceChannel = { id: 'vc1', name: 'General' };
  const textChannel = { id: 'tc1', send: jest.fn() };

  it('joins the channel, creates a DB row, and registers the session', async () => {
    const connection = makeConnection();
    joinVoiceChannel.mockReturnValue(connection);
    entersState.mockResolvedValue();
    ListenSession.create.mockResolvedValue({ id: 7 });

    const session = await voiceSessionManager.startListening({
      guild, voiceChannel, textChannel, startedByUserId: 'u1',
    });

    expect(joinVoiceChannel).toHaveBeenCalledWith({
      channelId: 'vc1', guildId: 'guild-start-1', adapterCreator: 'adapter', selfDeaf: false,
    });
    expect(ListenSession.create).toHaveBeenCalledWith(expect.objectContaining({
      server_id: 'guild-start-1',
      voice_channel_id: 'vc1',
      text_channel_id: 'tc1',
      started_by_user_id: 'u1',
    }));
    expect(connection.receiver.speaking.on).toHaveBeenCalledWith('start', expect.any(Function));
    expect(connection.on).toHaveBeenCalledWith(VoiceConnectionStatus.Disconnected, expect.any(Function));
    expect(voiceSessionManager.hasActiveSession('guild-start-1')).toBe(true);
    expect(voiceSessionManager.getSession('guild-start-1')).toBe(session);

    await voiceSessionManager.stopListening('guild-start-1', {});
  });

  it('destroys the connection and rethrows if the connection never becomes ready', async () => {
    const connection = makeConnection();
    joinVoiceChannel.mockReturnValue(connection);
    entersState.mockRejectedValue(new Error('timeout'));

    await expect(voiceSessionManager.startListening({
      guild: { id: 'guild-start-2', voiceAdapterCreator: 'adapter' }, voiceChannel, textChannel, startedByUserId: 'u1',
    })).rejects.toThrow('timeout');

    expect(connection.destroy).toHaveBeenCalled();
    expect(voiceSessionManager.hasActiveSession('guild-start-2')).toBe(false);
  });

  it('rejects a second start while a session is already active for the guild', async () => {
    const connection = makeConnection();
    joinVoiceChannel.mockReturnValue(connection);
    entersState.mockResolvedValue();
    ListenSession.create.mockResolvedValue({ id: 8 });

    await voiceSessionManager.startListening({
      guild: { id: 'guild-start-3', voiceAdapterCreator: 'adapter' }, voiceChannel, textChannel, startedByUserId: 'u1',
    });

    await expect(voiceSessionManager.startListening({
      guild: { id: 'guild-start-3', voiceAdapterCreator: 'adapter' }, voiceChannel, textChannel, startedByUserId: 'u2',
    })).rejects.toThrow('already active');

    expect(joinVoiceChannel).toHaveBeenCalledTimes(1);
    await voiceSessionManager.stopListening('guild-start-3', {});
  });
});

describe('stopListening', () => {
  it('returns null and skips DB writes when there is no active session', async () => {
    const result = await voiceSessionManager.stopListening('guild-does-not-exist', { stoppedByUserId: 'u1' });

    expect(result).toBeNull();
    expect(ListenSession.update).not.toHaveBeenCalled();
  });

  it('destroys the connection and marks the DB row ended', async () => {
    const connection = makeConnection();
    joinVoiceChannel.mockReturnValue(connection);
    entersState.mockResolvedValue();
    ListenSession.create.mockResolvedValue({ id: 9 });

    await voiceSessionManager.startListening({
      guild: { id: 'guild-stop-1', voiceAdapterCreator: 'adapter' },
      voiceChannel: { id: 'vc1', name: 'General' },
      textChannel: { id: 'tc1', send: jest.fn() },
      startedByUserId: 'u1',
    });

    await voiceSessionManager.stopListening('guild-stop-1', { stoppedByUserId: 'u2' });

    expect(connection.destroy).toHaveBeenCalled();
    expect(ListenSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ stopped_by_user_id: 'u2', end_reason: 'manual' }),
      { where: { id: 9 } },
    );
    expect(voiceSessionManager.hasActiveSession('guild-stop-1')).toBe(false);
  });
});

describe('buildSessionTranscript', () => {
  it('returns a placeholder when no utterances were transcribed', async () => {
    ListenUtterance.findAll.mockResolvedValue([]);

    const transcript = await voiceSessionManager.buildSessionTranscript(42);

    expect(ListenUtterance.findAll).toHaveBeenCalledWith({
      where: { session_id: 42 },
      order: [['sequence', 'ASC']],
    });
    expect(transcript).toContain('no utterances were transcribed');
  });

  it('formats each utterance as a timestamped line in sequence order', async () => {
    ListenUtterance.findAll.mockResolvedValue([
      { username: 'Alice', content: 'hello there', spoken_at: new Date(2024, 0, 1, 9, 5, 3) },
      { username: 'Bob', content: 'hi Alice', spoken_at: new Date(2024, 0, 1, 9, 5, 9) },
    ]);

    const transcript = await voiceSessionManager.buildSessionTranscript(42);

    expect(transcript).toBe(
      '[09:05:03] Alice: hello there\n[09:05:09] Bob: hi Alice\n'
    );
  });
});

describe('disconnect handling', () => {
  async function startSessionAndGetDisconnectHandler(guildId) {
    const connection = makeConnection();
    joinVoiceChannel.mockReturnValue(connection);
    entersState.mockResolvedValue();
    ListenSession.create.mockResolvedValue({ id: 55 });

    await voiceSessionManager.startListening({
      guild: { id: guildId, voiceAdapterCreator: 'adapter' },
      voiceChannel: { id: 'vc1', name: 'General' },
      textChannel: { id: 'tc1', send: jest.fn() },
      startedByUserId: 'u1',
    });

    const [, handler] = connection.on.mock.calls.find(([event]) => event === VoiceConnectionStatus.Disconnected);
    return { connection, handler };
  }

  it('leaves the session active when the connection recovers on its own', async () => {
    const { connection, handler } = await startSessionAndGetDisconnectHandler('guild-disc-1');
    entersState.mockResolvedValueOnce();

    await handler();

    expect(connection.destroy).not.toHaveBeenCalled();
    expect(voiceSessionManager.hasActiveSession('guild-disc-1')).toBe(true);

    await voiceSessionManager.stopListening('guild-disc-1', {});
  });

  it('tears down the session when the disconnect is terminal', async () => {
    const { connection, handler } = await startSessionAndGetDisconnectHandler('guild-disc-2');
    entersState.mockRejectedValue(new Error('gone'));

    await handler();

    expect(connection.destroy).toHaveBeenCalled();
    expect(ListenSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ end_reason: 'disconnected' }),
      { where: { id: 55 } },
    );
    expect(voiceSessionManager.hasActiveSession('guild-disc-2')).toBe(false);
  });
});

describe('endAllOpenSessionsForShutdown', () => {
  it('marks every still-open session as ended due to process shutdown', async () => {
    await voiceSessionManager.endAllOpenSessionsForShutdown();

    expect(ListenSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ end_reason: 'process_shutdown' }),
      { where: { ended_at: null } },
    );
  });
});
