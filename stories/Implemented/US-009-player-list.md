# US-009: View Player List

## Summary

As a server member, I want to view the list of players that are registered.

## Acceptance Criteria

**Given** players exist in the database

**When** a server member uses the command `/player list`

**Then** the bot replies with a paginated list of registered players

**And** each page contains up to 10 players

**And** three buttons appear below the list for pagination

**And** the buttons read

    - Next
    - Previous
    - Close

**And** when each button is clicked

**Then** the corresponding action is taken
___

## Notes
