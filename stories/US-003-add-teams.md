# US-003: Add Team

## Summary

As a TO, I want to add teams to our list so that I can organize the season.

## Acceptance Criteria

**Given** A new team with the name `Crimson Kitties` has been created

**When** I type `/teams add` `Crimson Kitties` and submit the message

**Then** the bot checks if `Crimson Kitties` already exists in the list
___

**When** the team's name does not already exist in the list

**Then** the team's name is saved to the list

**And** the bot confirms the save operation was successful with a reply.

___

**When** the team's name does already exist in the list

**Then** the bot will notify the user with an error message

**And** nothing else will happen.
                        