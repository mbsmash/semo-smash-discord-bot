# US-012: Reset all data for debugging

## Summary

As a bot user, I want to use the command `/reset` to reset all data to its initial state, to assist in debugging the bot.

## Acceptance Criteria

**Given** the bot has existing data in its database (players, teams, scores, and related state)

**When** a bot user runs the command `/reset`

**Then** the bot clears all stored data and returns the bot to its initial seed state

**And** the bot replies with a confirmation message that the reset completed successfully.

___

**When** the reset operation fails for any reason

**Then** the bot replies with an error message indicating the reset did not complete

**And** no partial reset state is left behind.

___

## Notes

- Intended for development/debugging workflows.
