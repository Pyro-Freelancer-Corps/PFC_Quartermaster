const fs = require('fs');
const path = require('path');
const { joinVoiceChannel, entersState, VoiceConnectionStatus, EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');
const sherpa_onnx = require('sherpa-onnx-node');
const { ListenSession, ListenUtterance } = require('../../config/database');

const MIN_UTTERANCE_MS = 500;
// How long a speaker can pause before their utterance is considered finished.
// Kept generous (vs. a "natural" ~300-500ms conversational pause) because ending
// too eagerly splits one sentence into several broken, separately-punctuated
// utterances. Overridable per-host via env in case a shorter cutoff is wanted.
const SILENCE_DURATION_MS = Number(process.env.VOICE_SILENCE_MS) || 2500;
const SAMPLE_RATE_IN = 48000;
const CHANNELS_IN = 2;
const BYTES_PER_SAMPLE = 2;
const SAMPLE_RATE_OUT = 16000;
const DOWNSAMPLE_FACTOR = SAMPLE_RATE_IN / SAMPLE_RATE_OUT;

const sessions = new Map(); // guildId -> session state

let recognizer = null;
let punctuator = null;
let transcriptionQueue = Promise.resolve();

function hasActiveSession(guildId) {
  return sessions.has(guildId);
}

function getSession(guildId) {
  return sessions.get(guildId);
}

function pcmDurationMs(byteLength, { sampleRate = SAMPLE_RATE_IN, channels = CHANNELS_IN, bytesPerSample = BYTES_PER_SAMPLE } = {}) {
  const bytesPerSecond = sampleRate * channels * bytesPerSample;
  return (byteLength / bytesPerSecond) * 1000;
}

// Downmixes 48kHz stereo Int16LE PCM to mono, applies a boxcar low-pass filter as
// basic anti-aliasing, then decimates to 16kHz Float32 samples in [-1, 1] for the
// local speech model. Good enough for speech recognition, not audiophile-grade.
function downsampleTo16kMono(pcmBuffer) {
  const totalFrames = Math.floor(pcmBuffer.length / (CHANNELS_IN * BYTES_PER_SAMPLE));
  const mono = new Float64Array(totalFrames);

  for (let i = 0; i < totalFrames; i++) {
    const offset = i * CHANNELS_IN * BYTES_PER_SAMPLE;
    const left = pcmBuffer.readInt16LE(offset);
    const right = pcmBuffer.readInt16LE(offset + BYTES_PER_SAMPLE);
    mono[i] = (left + right) / 2;
  }

  const outLength = Math.floor(totalFrames / DOWNSAMPLE_FACTOR);
  const samples = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const start = i * DOWNSAMPLE_FACTOR;
    let sum = 0;
    for (let j = 0; j < DOWNSAMPLE_FACTOR; j++) {
      sum += mono[start + j];
    }
    samples[i] = (sum / DOWNSAMPLE_FACTOR) / 32768;
  }

  return samples;
}

function getModelPaths() {
  const dir = process.env.STT_MODEL_DIR || path.join(__dirname, '..', '..', 'models', 'stt');
  return {
    encoder: path.join(dir, 'encoder.onnx'),
    decoder: path.join(dir, 'decoder.onnx'),
    joiner: path.join(dir, 'joiner.onnx'),
    tokens: path.join(dir, 'tokens.txt'),
  };
}

function getRecognizer() {
  if (recognizer) return recognizer;

  const { encoder, decoder, joiner, tokens } = getModelPaths();
  for (const filePath of [encoder, decoder, joiner, tokens]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Speech-to-text model file missing: ${filePath}. See CLAUDE.md "Voice transcription model" for the download command.`
      );
    }
  }

  recognizer = new sherpa_onnx.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE_OUT, featureDim: 80 },
    modelConfig: {
      transducer: { encoder, decoder, joiner },
      tokens,
      numThreads: 1,
      provider: 'cpu',
      debug: 0
    }
  });

  return recognizer;
}

function getPunctuationModelPath() {
  const dir = process.env.PUNCT_MODEL_DIR || path.join(__dirname, '..', '..', 'models', 'punct');
  return path.join(dir, 'model.int8.onnx');
}

let warnedMissingPunctuator = false;

// Lazily loads the punctuation-restoration model. Unlike getRecognizer(), a
// missing model here is non-fatal: transcription is still useful without
// punctuation, so callers fall back to the raw ASR text instead of throwing.
function getPunctuator() {
  if (punctuator) return punctuator;

  const ctTransformer = getPunctuationModelPath();
  if (!fs.existsSync(ctTransformer)) {
    if (!warnedMissingPunctuator) {
      console.error(
        `❌ Punctuation model file missing: ${ctTransformer}. See CLAUDE.md "Voice transcription model" for the download command. Transcripts will be posted without punctuation or sentence casing.`
      );
      warnedMissingPunctuator = true;
    }
    return null;
  }

  punctuator = new sherpa_onnx.OfflinePunctuation({
    model: { ctTransformer, numThreads: 1, provider: 'cpu', debug: 0 }
  });

  return punctuator;
}

// The punctuation model is trained on bilingual zh-en data and always emits
// full-width Chinese punctuation marks (，。？！、), even for pure English
// text — those look out of place in a Discord transcript, so they're mapped
// to their ASCII equivalents (with a trailing space, since the model attaches
// them directly to the preceding word with no space of their own).
function normalizePunctuation(text) {
  return text
    .replace(/、|，/g, ',')
    .replace(/。/g, '.')
    .replace(/？/g, '?')
    .replace(/！/g, '!')
    .replace(/([,.?!])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The ASR model transcribes in all caps with no punctuation (a GigaSpeech
// training-data convention), so every utterance needs cosmetic cleanup before
// it's fit to read. The ct-transformer model restores punctuation but
// deliberately does not touch casing, so sentence/pronoun capitalization is
// re-applied afterward with a simple heuristic — it won't catch proper nouns,
// but that's an acceptable tradeoff for a live voice-channel transcript.
function capitalizeSentences(text) {
  return text
    .replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (match) => match.toUpperCase())
    .replace(/\bi\b/g, 'I');
}

function formatTranscript(text) {
  const lowercased = text.toLowerCase();

  const punct = getPunctuator();
  let punctuated = lowercased;
  if (punct) {
    try {
      punctuated = normalizePunctuation(punct.addPunct(lowercased));
    } catch (error) {
      console.error('❌ Failed to restore punctuation for transcript:', error);
    }
  }

  return capitalizeSentences(punctuated).trim();
}

function runTranscription(pcmBuffer) {
  const rec = getRecognizer();
  const samples = downsampleTo16kMono(pcmBuffer);
  const stream = rec.createStream();
  stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE_OUT });
  rec.decode(stream);
  const result = rec.getResult(stream);
  const text = ((result && result.text) || '').trim();
  return text ? formatTranscript(text) : text;
}

// Serializes all recognizer calls: the native binding's thread-safety under
// concurrent calls is unverified, and a shared/limited CPU host can't usefully
// parallelize inference anyway. Utterances transcribe in arrival order.
function transcribeUtterance(pcmBuffer) {
  const result = transcriptionQueue.then(() => runTranscription(pcmBuffer));
  transcriptionQueue = result.catch(() => {});
  return result;
}

async function resolveDisplayName(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName || member.user.username || userId;
  } catch {
    return userId;
  }
}

const DISCORD_MESSAGE_LIMIT = 2000;
const CONTINUATION_PREFIX = '(cont.) ';

// Splits a long utterance into multiple Discord messages so it's never
// silently dropped for exceeding the 2000-character message limit.
function chunkForDiscordMessage(prefix, text, limit = DISCORD_MESSAGE_LIMIT) {
  if (prefix.length + text.length <= limit) {
    return [`${prefix}${text}`];
  }

  const chunks = [];
  let remaining = text;
  let currentPrefix = prefix;

  while (remaining.length > 0) {
    const available = limit - currentPrefix.length;
    chunks.push(currentPrefix + remaining.slice(0, available));
    remaining = remaining.slice(available);
    currentPrefix = CONTINUATION_PREFIX;
  }

  return chunks;
}

function captureUtterance(session, userId) {
  if (session.activeSubscriptions.get(userId)) return;
  session.activeSubscriptions.set(userId, true);

  const opusStream = session.connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_DURATION_MS }
  });
  const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE_IN, channels: CHANNELS_IN, frameSize: 960 });
  const chunks = [];

  opusStream.on('error', (error) => console.error('❌ Voice receive stream error:', error));
  decoder.on('error', (error) => console.error('❌ Opus decode error:', error));
  decoder.on('data', (chunk) => chunks.push(chunk));

  decoder.on('end', async () => {
    session.activeSubscriptions.set(userId, false);

    const pcmBuffer = Buffer.concat(chunks);
    const durationMs = pcmDurationMs(pcmBuffer.length);
    if (durationMs < MIN_UTTERANCE_MS) return;

    let text;
    try {
      text = await transcribeUtterance(pcmBuffer);
    } catch (error) {
      console.error('❌ Failed to transcribe voice utterance:', error);
      return;
    }
    if (!text) return;

    const displayName = await resolveDisplayName(session.guild, userId);
    session.utteranceSeq += 1;

    // Persist first so the utterance is never lost from the final transcript
    // even if posting it live fails (e.g. a long monologue exceeding Discord's
    // 2000-character message limit).
    try {
      await ListenUtterance.create({
        session_id: session.dbSessionId,
        user_id: userId,
        username: displayName,
        sequence: session.utteranceSeq,
        content: text,
        spoken_at: new Date(),
        duration_ms: Math.round(durationMs)
      });
    } catch (error) {
      console.error('❌ Failed to persist transcribed utterance:', error);
    }

    try {
      for (const message of chunkForDiscordMessage(`**${displayName}:** `, text)) {
        await session.textChannel.send(message);
      }
    } catch (error) {
      console.error('❌ Failed to post live transcript utterance:', error);
    }
  });

  opusStream.pipe(decoder);
}

async function markSessionEnded(dbSessionId, extra = {}) {
  try {
    await ListenSession.update(
      { ended_at: new Date(), ...extra },
      { where: { id: dbSessionId } }
    );
  } catch (error) {
    console.error('❌ Failed to mark listen session ended:', error);
  }
}

function watchForDisconnect(session) {
  session.connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(session.connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(session.connection, VoiceConnectionStatus.Connecting, 5_000)
      ]);
    } catch {
      session.connection.destroy();
      await markSessionEnded(session.dbSessionId, { end_reason: 'disconnected' });
      sessions.delete(session.guild.id);
    }
  });
}

async function startListening({ guild, voiceChannel, textChannel, startedByUserId }) {
  if (hasActiveSession(guild.id)) {
    throw new Error('A listening session is already active in this server.');
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    connection.destroy();
    throw error;
  }

  const dbSession = await ListenSession.create({
    server_id: guild.id,
    voice_channel_id: voiceChannel.id,
    text_channel_id: textChannel.id,
    started_by_user_id: startedByUserId,
    started_at: new Date()
  });

  const session = {
    guild,
    connection,
    textChannel,
    dbSessionId: dbSession.id,
    activeSubscriptions: new Map(),
    utteranceSeq: 0
  };

  connection.receiver.speaking.on('start', (userId) => captureUtterance(session, userId));
  watchForDisconnect(session);

  sessions.set(guild.id, session);
  return session;
}

async function stopListening(guildId, { stoppedByUserId } = {}) {
  const session = sessions.get(guildId);
  if (!session) return null;

  session.connection.destroy();
  await markSessionEnded(session.dbSessionId, { stopped_by_user_id: stoppedByUserId, end_reason: 'manual' });
  sessions.delete(guildId);

  return session;
}

function formatTimestamp(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function buildSessionTranscript(dbSessionId) {
  const utterances = await ListenUtterance.findAll({
    where: { session_id: dbSessionId },
    order: [['sequence', 'ASC']]
  });

  if (!utterances.length) {
    return '(no utterances were transcribed in this session)\n';
  }

  return utterances
    .map((u) => `[${formatTimestamp(new Date(u.spoken_at))}] ${u.username}: ${u.content}`)
    .join('\n') + '\n';
}

async function endAllOpenSessionsForShutdown() {
  await ListenSession.update(
    { ended_at: new Date(), end_reason: 'process_shutdown' },
    { where: { ended_at: null } }
  );
}

module.exports = {
  hasActiveSession,
  getSession,
  startListening,
  stopListening,
  endAllOpenSessionsForShutdown,
  buildSessionTranscript,
  captureUtterance,
  chunkForDiscordMessage,
  downsampleTo16kMono,
  pcmDurationMs,
  transcribeUtterance,
  getRecognizer,
  getPunctuator,
  formatTranscript,
  MIN_UTTERANCE_MS,
  SILENCE_DURATION_MS,
  // Test-only: resets the module-level recognizer/punctuator singletons between test cases.
  __resetRecognizerForTests: () => { recognizer = null; },
  __resetPunctuatorForTests: () => { punctuator = null; warnedMissingPunctuator = false; }
};
