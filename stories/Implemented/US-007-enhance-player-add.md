# US-007: Assign Players

## Summary

As a TO, I want the option to add additional properties to a player when they are added.

## Acceptance Criteria

**Given** a TO has added a player using the `/player add [playerName]` command

**Then** the bot responds with a message confirming the player is added

___

**When** the confirmation message appears

**Then** the message reads "[playerName] added. Please select any additional player information below."

**And** below the message is a row of buttons allowing the TO to select additional information about the player

**And** the buttons include
- Top Player

___

**When** a button is clicked

**Then** the corresponding information is associated with the player and saved.

## Notes
