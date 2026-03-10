# Smash Bot Developer README

Discord bot for managing Smash season teams and players, with a local terminal test mode.

## Setup

1. Copy `.env.example` to `.env` and add your bot token:

```bash
cp .env.example .env
```

Add these values from the Discord Developer Portal:

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY` (not used yet)
- `DISCORD_GUILD_ID` (optional; faster slash-command updates for a test server)

2. Install dependencies:

```bash
npm install
```

3. Run the bot:

```bash
npm run start
```

## Railway Deployment

1. Create a new Railway service from this repo.
2. Set required environment variables in Railway:

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID` (optional)
- `START_GG_API_TOKEN` (optional)
- `EVENTS_COMMAND_CHANNEL_ID` (optional fallback if per-server setup is not set)
- `EVENTS_PUBLISH_CHANNEL_ID` (optional fallback if per-server setup is not set)

3. Attach a persistent volume and mount it to `/data`.
4. Set `BOT_DATA_DIR=/data` so `data.json` survives restarts/redeploys.
5. Deploy with start command `npm run start`.
6. Run `npm run register:commands` once after deploy (from local machine or Railway shell).

## Slash commands (Discord UI)

Register commands after updating `.env`:

```bash
npm run register:commands
```

If `DISCORD_GUILD_ID` is set, commands register instantly for that server. Otherwise global commands can take a while to appear.

### Discord UI

Use `/player manage` and `/team manage` to open interactive embeds with buttons and select menus for updating data.

## Local testing (no Discord required)

- Interactive mode:

```bash
npm run test:local
```

- One-off test:

```bash
node src/index.js --test "/player add Alpha"
```

Local commands accept either `!` or `/` prefixes.

### Interactive manage menus (local only)

In local test mode, `/player manage [playerName]` and `/team manage [teamName]` open arrow-key menus for:

- Updating names
- Assigning teams
- Toggling top player / captain
- Managing team rosters (select a member to make captain or remove from team)

## Commands

The bot uses Discord slash commands only in Discord. Message commands are supported in local test mode.

### Player commands

- `/player add [playerName]`
- `/player assign [playerName]` (optional `[teamName]`; otherwise balanced auto-assign)
- `/player manage [playerName]`
- `/player list`

### Team commands

- `/team add [teamName]`
- `/team manage [teamName]`

### Teams view

- `/teams` (embeds every team with score + roster)
  - `/player list` shows up to 10 players per page with Next/Previous/Close buttons.

### Events commands

- `/setup channels` (admin-only per-server setup for events command/publish channels; optional `clear_existing_events` boolean)
- `/events add` (opens modal first, then region dropdown; optional `startgg_url` URL or short slug)
- `/events edit`
- `/events remove`
- `/events list` (optional `month`, `year`)
- `/events publish` (manually forces board refresh in the publish channel)

If you have a start.gg page, include `startgg_url` when adding and the bot will try to import details automatically.
Both tournament URLs and tournament-event URLs are supported.
If not, you can enter everything manually in the modal.

Events board behavior:

- Recommended: configure channels per guild with `/setup channels`.
- Optional fallback: `EVENTS_COMMAND_CHANNEL_ID` and `EVENTS_PUBLISH_CHANNEL_ID` env vars.
- Events commands can be restricted to one command channel.
- The board message is posted/updated in a separate channel.
- The board is a single message with one embed section per populated region.
- Empty regions are omitted automatically.
- Events are stored per guild to prevent cross-server data bleed.

### Debug command

- `/reset` (clears all bot data back to initial state)


## Data storage

- Data is stored locally in `data/data.json`.
- The file is created on first use.
- `BOT_DATA_DIR` can override the data directory (recommended on Railway: `/data`).
- `BOT_DATA_PATH` can override the full data file path.

### Optional start.gg import

- Set `START_GG_API_TOKEN` in `.env` to enable start.gg auto-import during `/events add`.
- You can set `EVENTS_COMMAND_CHANNEL_ID` and `EVENTS_PUBLISH_CHANNEL_ID` in `.env` as fallback defaults.

Quick API debug command:

```bash
npm run debug:startgg -- kachow-kup
```

You can also pass a full tournament URL instead of a short slug.

## Notes

- This is an alpha workflow: use `/help` to list commands and build out features iteratively.
