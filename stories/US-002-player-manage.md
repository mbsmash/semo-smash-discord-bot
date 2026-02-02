# US-002: Manage Player

## Summary

As a TO, I want to manage players so that I can update their information.

## Acceptance Criteria

**Given** a player named `Roger` exists in our database

**When** a TO uses the command `/player manage` `Roger`

**Then** an interactive interface appears using Discord embeds, buttons and select menus

___

**When** the player management screen appears

**Then** a banner at the top reads: "Manage Player: `Roger`"

**And** the following actions are available as buttons or menus:

- Update name (opens a modal to enter the new name)
- Assign team (opens a dropdown of all teams plus Unassigned)
- Assign/Unset Top Player (button toggle)
- Assign/Unset Captain (button toggle)
- Remove player (requires confirmation)
- "I'm done, close this message" (deletes the management message)

___

**When** an action is chosen and confirmed (for example, saving a new name)

**Then** the player's information is updated

**And** the bot confirms the operation to the user.

___

**When** the user cancels a modal or confirmation

**Then** the player's information is NOT updated

**And** the bot confirms the cancellation to the user.
