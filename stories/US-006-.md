# US-0056: Assign Players

## Summary

As a TO, I want to assign players to teams.

## Acceptance Criteria

**Given** several teams exist with varying roster sizes and top-player counts

**When** a TO assigns a player via the random assignment workflow

**Then** the bot chooses a team that keeps rosters within two-to-four players of each other while prioritizing teams with fewer top players when a top player is being placed

**And** the bot reports which team received the player

___

**When** the player already has a captain/top flag

**Then** the same balancing logic applies, accounting for their status

___

**When** no team improves the balance (e.g., all rosters are full)

**Then** the bot assigns the player to the least-full roster and notes the imbalance

___

**When** required data is missing

**Then** the bot returns an error instead of guessing


## Notes
Assignment will be pseudo-random, with the following rules:

- We will always try to distribute top players between the teams as evenly as possible, so we need to know:
    - How many top players are on each team
    - Is the player being assigned a top player?
- We will always try to keep the overall distribution within roughly 2-4 total players between all teams. This is to allow for appropriate random assignments while also doing what we can to keep distribution even.
