# US-001: Add Player

## Summary

As a TO, I want to add players to our list when they register for our events so that we can put them on a team.

## Acceptance Criteria

**Given** A new player with the name `Roger` has registered

**When** I type `/player add` `Roger` and submit the message

**Then** the bot checks if `Roger` already exists in the list
___

**When**  the player's name does not already exist in the list

**Then** the player's name is saved to the list

**And** the bot confirms the save operation was successful with a reply.

___

**When** the player's name does already exist in the list

**Then** the bot will notify the user with an error message

**And** nothing else will happen.

