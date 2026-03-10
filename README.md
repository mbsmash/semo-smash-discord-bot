# Smash Bot User Guide

Smash Bot has two separate functional flows:

1. Season Management (players, teams, scores, points)
2. Event Management (upcoming events board by region)

These systems are intentionally separate so communities can use one or both without mixing workflows.

## Quick Start

1. Invite/add the bot to your server.
2. Ask an admin to run `npm run register:commands` if commands are not visible yet.
3. Run `/setup channels` once to choose your events command channel and events board channel.
4. Use slash commands in Discord.

## Core Functions and Commands

The bot features two main areas of functionality:

1. Manage and update players and teams for the themed SEMO Smash Season competitions.

2. Easily manage and share information for upcoming tournaments and events in the community.

## Season Management Commands

#### Players

- `/player add`
- `/player assign`
- `/player manage`
- `/player list`

#### Teams

- `/team add`
- `/team manage`
- `/teams`

#### Scores

- `/scores add`
- `/scores remove`
- `/points`

## Event Management Commands

- `/setup channels` (admin only; choose the server’s events command + publish channels, optional cleanup)
- `/events add`
- `/events edit`
- `/events remove`
- `/events list`
- `/events publish`

### Debug

- `/reset`

## Event Management Workflow

`/events add` flow:

1. Open add modal (optional `startgg_url` pre-fills fields).
2. Submit modal.
3. Select region from dropdown (SEMO, Rolla, St. Louis, Kansas City, CoMo, SoIL, Springfield, WKY, Regional, Major).
4. Bot saves event and updates the board message.

`/setup channels` supports an optional `clear_existing_events` toggle:

- When enabled, it clears the current server's saved events and resets its board tracking.

## Events Board Behavior

- The channel routing is per server and configured with `/setup channels`.
- Event lists are stored per server.
- Board message is a single post in the configured publish channel.
- Event sections are shown as grouped categories:
  - SEMO Events: SEMO
  - Missouri and Nearby Region Events: STL, KC, Rolla, CoMo, SoIL, Springfield, WKY
  - Regional/Major Events: Regional, Major
- Categories with no events are automatically hidden.
- Adding/removing/editing events auto-updates the board.

## Need Dev/Setup Details?

See the developer documentation:

- `README.developer.md`
