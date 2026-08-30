# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PFC Quartermaster is a Discord bot for the Pyro Freelancers Corps Star Citizen organization. It features slash commands, an Express REST API, Sequelize ORM with MySQL, and integrations with OpenAI, Google Drive, and Star Citizen APIs (RSI, UEX).

## Commands

```bash
npm run setup      # Clean install + run tests (use this for initial setup)
npm start          # Run the bot (node bot.js)
npm test           # Run Jest test suite with coverage
npm run snapshot   # Manually refresh cached guild data (accolades/officers)
```

Run a single test file:
```bash
npx jest __tests__/path/to/test.test.js
```

## Architecture

### Entry Points
- [bot.js](bot.js) - Main Discord bot entry point. Initializes client, registers event handlers, starts the API server
- [api/server.js](api/server.js) - Express API server (runs on port 8003 by default)

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `/commands/` | Slash command modules organized by category (admin/, fun/, tools/, user/) |
| `/botactions/` | Event handlers and bot logic modules |
| `/botactions/eventHandling/` | Discord event handlers (interactions, messages, reactions, voice, moderation) |
| `/botactions/scheduling/` | Scheduled announcement and reminder engines |
| `/api/` | Express REST API routes and middleware |
| `/models/` | Sequelize model definitions |
| `/config/` | Database and bot configuration |
| `/jobs/` | Background job logic (log flushing, guild snapshots) |
| `/utils/` | Shared utilities (API sync, trade calculations, profile scraping) |

### Command Structure
Commands use discord.js SlashCommandBuilder. Each command file exports:
- `data`: SlashCommandBuilder definition
- `execute(interaction, client)`: Command handler

Commands are auto-loaded recursively from `/commands/`. If a directory has a matching parent `.js` file (e.g., `ambient.js` for `ambient/`), only the parent file is loaded.

### Event Handling Pattern
Events flow through [botactions/eventHandling.js](botactions/eventHandling.js) which re-exports handlers from subdirectories:
- `interactionEvents/` - Slash commands, buttons, modals
- `messageEvents/` - Message create/delete/update
- `reactionEvents/` - Reaction add/remove
- `voiceEvents/` - Voice state changes
- `moderationEvents/` - Member remove, ban, updates

### Database
- Sequelize ORM with MySQL dialect
- All models initialized in [config/database.js](config/database.js)
- Models use factory pattern: `module.exports = (sequelize) => sequelize.define(...)`
- Database environment selected via `BOT_TYPE` env var (`development` or `production`)

### API Authentication
- JWT-based auth via Discord OAuth2
- Public endpoints: `/api/accolades`, `/api/content`, `/api/events`, `/api/orgs`, `/api/officers`
- Protected endpoints require `Authorization: Bearer <token>` header
- Swagger docs available at `/api/docs` when server is running

## Configuration Files

- `config.json` - Discord bot token, guild ID, client ID, SC API key, bot_type
- `databaseConfig.json` - Database credentials per environment
- `.env` - Environment variables (BOT_TYPE, OPENAI_API_KEY, JWT_SECRET, STT_MODEL_DIR, etc.)

### Voice transcription model (`/listen` command)

`/listen start` transcribes speech fully locally via `sherpa-onnx-node` — no audio or text is ever sent to a third-party API. The model weights (~74MB: `encoder.onnx`, `decoder.onnx`, `joiner.onnx`, `tokens.txt`) are committed directly into `models/stt/` so the bot works immediately after a fresh `git clone`/`git pull` deploy, with no separate download step — this matters on hosts like PebbleHost where deploys are just a git checkout and there's no asset-provisioning step to hook a download into.

`STT_MODEL_DIR` (defaults to `models/stt/`) can still override the path if you want to point at a different model on a given host.

If these files are ever regenerated or replaced, they must come from a non-streaming ("offline") transducer model — a streaming model loaded into `OfflineRecognizer` builds a malformed input feed and crashes the process natively (no catchable JS error) on `decode()`. Don't swap in a model whose repo name contains "streaming" without also switching to `OnlineRecognizer` and rewriting the decode loop. The current model is `sherpa-onnx-zipformer-gigaspeech-2023-12-12` (int8), originally from:

```bash
curl -L -o models/stt/encoder.onnx https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-gigaspeech-2023-12-12/resolve/main/encoder-epoch-30-avg-1.int8.onnx
curl -L -o models/stt/decoder.onnx https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-gigaspeech-2023-12-12/resolve/main/decoder-epoch-30-avg-1.int8.onnx
curl -L -o models/stt/joiner.onnx https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-gigaspeech-2023-12-12/resolve/main/joiner-epoch-30-avg-1.int8.onnx
curl -L -o models/stt/tokens.txt https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-gigaspeech-2023-12-12/resolve/main/tokens.txt
```

If these files are missing, `/listen start` still joins the voice channel but logs an error and skips transcription instead of crashing.

The ASR model above outputs text in all caps with no punctuation (a GigaSpeech training-data convention). Before an utterance is posted or persisted, `formatTranscript()` in [botactions/voice/voiceSessionManager.js](botactions/voice/voiceSessionManager.js) lowercases it and runs it through a punctuation-restoration model (`sherpa_onnx.OfflinePunctuation`, ~76MB `model.int8.onnx`, committed into `models/punct/` for the same no-download-step reason as the STT model above). That model restores commas/periods/question marks but deliberately does not fix casing, so sentence-start and standalone-"I" capitalization is reapplied afterward with a plain regex heuristic — it won't catch proper nouns, but that's an acceptable tradeoff for a live voice-channel transcript. The model is bilingual (zh-en) and always emits full-width Chinese punctuation (，。？！、) even for English text, so `normalizePunctuation()` maps those to their ASCII equivalents before casing is applied. `PUNCT_MODEL_DIR` (defaults to `models/punct/`) overrides the path. A missing punctuation model is non-fatal — same as a missing STT model, it logs once and the transcript is posted lowercased-and-capitalized but without restored punctuation. The current model is `sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8`, originally from:

```bash
curl -L -o /tmp/punct.tar.bz2 https://github.com/k2-fsa/sherpa-onnx/releases/download/punctuation-models/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8.tar.bz2
tar xjf /tmp/punct.tar.bz2 -C /tmp
cp /tmp/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/model.int8.onnx models/punct/model.int8.onnx
cp /tmp/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/tokens.json models/punct/tokens.json
```

`/listen` waits for `VOICE_SILENCE_MS` (defaults to 2500ms) of silence before treating an utterance as finished — kept well above a natural conversational pause (~300-500ms) because ending too eagerly splits one sentence into several separately-punctuated utterances. Lower it per-host via env if faster turnaround matters more than sentence continuity.

## Testing

- Jest with 80% coverage threshold (branches, functions, lines, statements)
- Tests in `__tests__/` mirror source structure
- Mocks in `__mocks__/` (including custom discord.js mock)
- Swagger JSON auto-generated before tests via `npm run pretest`

## Key Integrations

- **Star Citizen APIs**: RSI profile scraping, UEX trading data sync
- **OpenAI**: AI-powered responses via [botactions/eventHandling/messageEvents/openaiHandler.js](botactions/eventHandling/messageEvents/openaiHandler.js)
- **Google Drive**: Document access via service account credentials
