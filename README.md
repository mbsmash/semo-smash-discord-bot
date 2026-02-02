# Smash Bot (Alpha)

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

### Team commands

- `/teams add [teamName]`
- `/teams manage [teamName]`

Alias:

- `/team add [teamName]`
- `/team manage [teamName]`


## Data storage

- Data is stored locally in `data/data.json`.
- The file is created on first use.

## Notes

- This is an alpha workflow: use `/help` to list commands and build out features iteratively.
