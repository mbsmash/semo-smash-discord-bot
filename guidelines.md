# Discord Bot - Alpha

## Background

Our smash scene uses a system each season which essentially divides players into teams. We do this pseudo-randomly, with an emphasis on trying to keep the teams balanced in terms of skill level to ensure fairness. During the season, players earn points for their team by completing challenges including scoring upsets in a bracket, or winning a highlighted set vs. a long standing rival of theirs.

## Purpose

This bot will allow tournament organizers to create, manage and organize teams and players. This will all be handled through a Discord channel using slash commands (or console commands while testing locally) and passing parameters. After moving to Discord for beta testing, a dynamic interface will be created using Discord chat elements.

## Data

Data structure should remain basic and lightweight.

The concept of a `Player` will need to be understood by the application.

A `Player` will have the following properties, using myself as an example:

Tag: The string of text representing the competing player.

Team: The team the player is currently assigned to.

Top Player: a boolean flag that is editable. This is to assist in balancing the skill level amongst our teams.

Captain: a boolean flag that is editable. Denotes a player assigned as team captain. A team may have multiple captains.

## Commands
**Note**: Discord slash commands are planned for use. In the below examples, I will utilize `/slash` command notation. For testing purposes, these should work with `!slash` syntax locally.
___

`/player`: the root command for player management. Examples:

`/player add [playerName]`: add a player with designated `[playerName]` to the list of players.

`/player manage [playerName]`: manage details of player with designated `[playerName]`. 
- Beta feature: use an interactive UI in Discord with embeds, emojis and button navigation.

`/player assign [playerName] [teamName]`: assign designated player to designated team.

___

`/team`: the root command for team management. Examples:

`/team add [teamName]`: add a new team to the list.

`/team manage [teamName]`: manage details of team with designated `[teamName]`