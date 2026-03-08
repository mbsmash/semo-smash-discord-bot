# US-010: Add and remove points

## Summary

As a TO, I want the ability to add and remove points from players and teams so that we can track the competition scores.

## Acceptance Criteria

_Scenario: No team specified_

**Given** a player or team has earned points

**When** a TO uses the command `/scores add`

**Then** the bot will respond with an array of buttons, with one button corresponding to each team

**And** when the TO clicks a button for a team

**Then** the bot displays an input interface for the necessary information.

___

**When** the bot displays the input interface

**Then** a numeric input is the first option available

**And** the numeric input has the title: "Add how many points?"

**And** below the numeric input, the bot displays a dropdown selection containing all members of the specified team

**And** the dropdown input has the title: "Who scored the points?"

**And** below the two forms is a "confirm" button

**And** when the "confirm" button is clicked

**Then** the operation is performed and the data is saved successfully.
___

## Notes

If a player earns points, those points should also be associated with their current team's score