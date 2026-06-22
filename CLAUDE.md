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
| `/commands/` | Slash command modules organized by category (admin/, fun/, tools/, user/, hunt/) |
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

Commands are auto-loaded recursively from `/commands/`. If a directory has a matching parent `.js` file (e.g., `hunt.js` for `hunt/`), only the parent file is loaded.

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
- `.env` - Environment variables (BOT_TYPE, OPENAI_API_KEY, JWT_SECRET, etc.)

## Testing

- Jest with 80% coverage threshold (branches, functions, lines, statements)
- Tests in `__tests__/` mirror source structure
- Mocks in `__mocks__/` (including custom discord.js mock)
- Swagger JSON auto-generated before tests via `npm run pretest`

## Key Integrations

- **Star Citizen APIs**: RSI profile scraping, UEX trading data sync
- **OpenAI**: AI-powered responses via [botactions/eventHandling/messageEvents/openaiHandler.js](botactions/eventHandling/messageEvents/openaiHandler.js)
- **Google Drive**: Document access via service account credentials
