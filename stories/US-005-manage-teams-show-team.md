# US-005: Manage Teams - Show Team on button click

## Summary

As a TO, I want to manage teams so that I can update team rosters and leadership quickly.

## Acceptance Criteria

**Given** the TO selects a team button

**Then** the bot displays a list of that team’s players

**And** each player shows an emoji indicating if they are a Captain or Top Player

**And** Captains or Top Players appear at the top of the list

**And** a title/banner appears below the list which reads "What would you like to manage?"

**And** the following actions are available as buttons

- Player Assignments
- Captains
- Top Players
- I’m done, close this message

___

**When** the TO performs any of the actions

**Then** the selected team’s roster or roles are updated

**And** the bot confirms the operation to the user

___

**When** the TO selects “I’m done, close this message”

**Then** the management message is deleted

**And** no further changes are made
