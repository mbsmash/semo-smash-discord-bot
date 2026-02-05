import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  InteractionType,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import readline from "node:readline";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

const COMMAND_PREFIXES = ["!", "/"];
const DATA_PATH = path.resolve("data", "data.json");
const PAGE_SIZE = 10;

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function buildTeamStats(data, excludePlayerTag) {
  const statsMap = {};
  Object.values(data.teams).forEach((team) => {
    statsMap[normalizeName(team.name)] = { team, count: 0, topCount: 0 };
  });

  Object.values(data.players).forEach((player) => {
    if (excludePlayerTag && normalizeName(player.tag) === normalizeName(excludePlayerTag)) {
      return;
    }
    if (!player.team) return;
    const key = normalizeName(player.team);
    const entry = statsMap[key];
    if (!entry) return;
    entry.count += 1;
    if (player.topPlayer) {
      entry.topCount += 1;
    }
  });

  return Object.values(statsMap);
}

function chooseTeamForAssignment(player, data) {
  const stats = buildTeamStats(data, player.tag);
  if (!stats.length) {
    return { error: "No teams exist yet. Create one with /team add first." };
  }

  const minCount = Math.min(...stats.map((entry) => entry.count));
  let bestEntry = null;
  let bestScore = Infinity;

  stats.forEach((entry) => {
    const rosterScore = Math.max(entry.count - minCount, 0);
    const topScore = player.topPlayer ? entry.topCount : 0;
    const score = rosterScore * 10 + topScore * 5 + Math.random();

    if (score < bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  });

  if (!bestEntry) {
    return { error: "Failed to find a team for assignment." };
  }

  const counts = stats.map((entry) => entry.count);
  const bestIndex = stats.indexOf(bestEntry);
  const countsAfter = counts.map((count, index) =>
    index === bestIndex ? count + 1 : count
  );
  const diffAfter = Math.max(...countsAfter) - Math.min(...countsAfter);
  const status =
    diffAfter <= 4
      ? `Assigned to ${bestEntry.team.name} while keeping rosters balanced.`
      : `Assigned to ${bestEntry.team.name}; distribution is slightly uneven.`;

  return { team: bestEntry.team, status, diffAfter };
}

function encodeKey(value) {
  return encodeURIComponent(value);
}

function decodeKey(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function ensureDataDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_PATH)) {
    return { players: {}, teams: {} };
  }

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      players: parsed.players ?? {},
      teams: parsed.teams ?? {}
    };
  } catch (err) {
    console.error("Failed to read data.json, starting fresh:", err);
    return { players: {}, teams: {} };
  }
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function formatPlayer(player) {
  const teamLabel = player.team ? player.team : "(unassigned)";
  return [
    `Tag: ${player.tag}`,
    `Team: ${teamLabel}`,
    `Top Player: ${player.topPlayer ? "yes" : "no"}`,
    `Captain: ${player.captain ? "yes" : "no"}`
  ].join("\n");
}

function formatPlayerList(data) {
  const players = Object.values(data.players).sort((a, b) =>
    a.tag.localeCompare(b.tag, "en", { sensitivity: "base" })
  );

  if (!players.length) {
    return "No players yet.";
  }

  return players
    .map((player) => {
      const teamLabel = player.team ? player.team : "Unassigned";
      return `${player.tag} — ${teamLabel}`;
    })
    .join("\n");
}

function formatTeam(teamName, data) {
  const players = Object.values(data.players).filter(
    (player) => player.team && normalizeName(player.team) === normalizeName(teamName)
  );
  const captains = players.filter((player) => player.captain);
  const teamKey = normalizeName(teamName);
  const team = data.teams[teamKey];
  const points = team?.points ?? 0;

  return [
    `Team: ${teamName}`,
    `Players: ${players.length ? players.map((p) => p.tag).join(", ") : "(none)"}`,
    `Captains: ${captains.length ? captains.map((p) => p.tag).join(", ") : "(none)"}`,
    `Points: ${points}`
  ].join("\n");
}

function formatTeamList(data) {
  const teams = Object.values(data.teams).sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );

  if (!teams.length) {
    return "No teams yet.";
  }

  return teams
    .map((team) => {
      const points = team.points ?? 0;
      return `${team.name} — ${points} pts`;
    })
    .join("\n");
}

function buildPlayerEmbed(player) {
  const teamLabel = player.team ? player.team : "Unassigned";
  return new EmbedBuilder()
    .setTitle(`Player: ${player.tag}`)
    .setDescription(
      [
        `**Team:** ${teamLabel}`,
        `**Top Player:** ${player.topPlayer ? "Yes" : "No"}`,
        `**Captain:** ${player.captain ? "Yes" : "No"}`
      ].join("\n")
    )
    .setColor(0x3b82f6);
}

function buildPlayerAddEmbed(player) {
  return new EmbedBuilder()
    .setTitle(`${player.tag} added`)
    .setDescription(`${player.tag} added. Please select any additional player information below.`)
    .setColor(0x3b82f6);
}

function buildPlayerAddComponents(player) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`playerAdd:top:${normalizeName(player.tag)}`)
      .setLabel(player.topPlayer ? "Top Player (set)" : "Top Player")
      .setStyle(player.topPlayer ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  return [row];
}

function buildTeamEmbed(team, data) {
  const players = Object.values(data.players).filter(
    (player) => player.team && normalizeName(player.team) === normalizeName(team.name)
  );
  const captains = players.filter((player) => player.captain);
  const points = team.points ?? 0;

  return new EmbedBuilder()
    .setTitle(`Team: ${team.name}`)
    .setDescription(
      [
        `**Points:** ${points}`,
        `**Players:** ${players.length ? players.map((p) => p.tag).join(", ") : "None"}`,
        `**Captains:** ${captains.length ? captains.map((p) => p.tag).join(", ") : "None"}`
      ].join("\n")
    )
    .setColor(0x22c55e);
}

function buildListEmbed(title, lines, emptyMessage) {
  const description = lines.length ? lines.join("\n") : emptyMessage;
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x6366f1);
}

function buildTeamsListEmbed(data) {
  const teams = Object.values(data.teams).sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );

  if (!teams.length) {
    return new EmbedBuilder()
      .setTitle("Teams")
      .setDescription("No teams yet. Add one with `/team add`.")
      .setColor(0x22c55e);
  }

  const description = teams
    .map((team) => {
      const players = Object.values(data.players)
        .filter((player) => player.team && normalizeName(player.team) === normalizeName(team.name))
        .map((player) => player.tag);
      const members = players.length ? players.join(", ") : "None yet";
      return `**${team.name}** — ${team.points ?? 0} pts\nPlayers: ${members}`;
    })
    .join("\n\n");

  return new EmbedBuilder().setTitle("Teams").setDescription(description).setColor(0x22c55e);
}

function buildPlayerListEmbed(players, page) {
  if (!players.length) {
    return new EmbedBuilder()
      .setTitle("Players")
      .setDescription("No players registered yet.")
      .setColor(0x3b82f6);
  }

  const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = currentPage * PAGE_SIZE;
  const slice = players.slice(start, start + PAGE_SIZE);

  const lines = slice.map((player) => {
    const badges = `${player.captain ? "👑" : ""}${player.topPlayer ? "⭐" : ""}`;
    const teamLabel = player.team ? player.team : "Unassigned";
    return `${badges ? `${badges} ` : ""}${player.tag} — ${teamLabel}`;
  });

  return new EmbedBuilder()
    .setTitle("Players")
    .setDescription(`${lines.join("\n")}\n\nPage ${currentPage + 1} of ${totalPages}`)
    .setColor(0x3b82f6);
}

function buildPlayerListComponents(page, totalPages) {
  const prevDisabled = page <= 0;
  const nextDisabled = page >= totalPages - 1;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`playerList:nav:prev:${page}`)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(prevDisabled),
      new ButtonBuilder()
        .setCustomId(`playerList:nav:next:${page}`)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(nextDisabled),
      new ButtonBuilder()
        .setCustomId(`playerList:nav:close:${page}`)
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}


function buildPlayerManageComponents(player) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`player:rename:${normalizeName(player.tag)}`)
      .setLabel("Update name")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`player:toggleTop:${normalizeName(player.tag)}`)
      .setLabel(player.topPlayer ? "Unset top player" : "Assign top player")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`player:toggleCaptain:${normalizeName(player.tag)}`)
      .setLabel(player.captain ? "Unset captain" : "Assign captain")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`player:assignTeam:${normalizeName(player.tag)}`)
      .setLabel("Assign team")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`player:removeConfirm:${normalizeName(player.tag)}`)
      .setLabel("Remove player")
      .setStyle(ButtonStyle.Danger)
    ,
    new ButtonBuilder()
      .setCustomId(`player:done:${normalizeName(player.tag)}`)
      .setLabel("I'm done, close this message")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, row2];
}

function buildPlayerRemoveConfirmComponents(player) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`player:remove:${normalizeName(player.tag)}`)
      .setLabel("Confirm remove")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`player:cancelRemove:${normalizeName(player.tag)}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
  return [row];
}

function buildTeamManageComponents(team) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:rename:${normalizeName(team.name)}`)
      .setLabel("Update name")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`team:points:${normalizeName(team.name)}`)
      .setLabel("Adjust points")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`team:roster:${normalizeName(team.name)}`)
      .setLabel("Manage roster")
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:removeConfirm:${normalizeName(team.name)}`)
      .setLabel("Remove team")
      .setStyle(ButtonStyle.Danger)
  );

  return [row, row2];
}

function buildTeamRemoveConfirmComponents(team) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:remove:${normalizeName(team.name)}`)
      .setLabel("Confirm remove")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`team:cancelRemove:${normalizeName(team.name)}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
  return [row];
}

function buildAssignTeamMenu(player, data) {
  const teams = Object.values(data.teams).sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );
  const options = [
    { label: "Unassigned", value: "__unassigned__" },
    ...teams.map((team) => ({ label: team.name, value: normalizeName(team.name) }))
  ];

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`player:assignTeamSelect:${normalizeName(player.tag)}`)
    .setPlaceholder("Select a team")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`player:assignTeamBack:${normalizeName(player.tag)}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, backRow];
}

function buildRosterMenu(team, data) {
  const members = Object.values(data.players).filter(
    (player) => player.team && normalizeName(player.team) === normalizeName(team.name)
  );
  const options = members.map((member) => ({
    label: member.tag,
    value: normalizeName(member.tag)
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`team:rosterSelect:${normalizeName(team.name)}`)
    .setPlaceholder(options.length ? "Select a team member" : "No members yet")
    .setDisabled(!options.length);

  if (options.length) {
    menu.addOptions(options);
  }

  const row = new ActionRowBuilder().addComponents(menu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:back:${normalizeName(team.name)}`)
      .setLabel("Back to team")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, backRow];
}

function buildRosterMemberComponents(team, member) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:memberToggleCaptain:${normalizeName(team.name)}:${normalizeName(
        member.tag
      )}`)
      .setLabel(member.captain ? "Unset captain" : "Make captain")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`team:memberRemove:${normalizeName(team.name)}:${normalizeName(member.tag)}`)
      .setLabel("Remove from team")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:roster:${normalizeName(team.name)}`)
      .setLabel("Back to roster")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, row2];
}

function buildAdjustPointsMenu(team) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`team:pointsSelect:${normalizeName(team.name)}`)
    .setPlaceholder("Choose how to adjust points")
    .addOptions(
      { label: "Add points", value: "add" },
      { label: "Deduct points", value: "deduct" },
      { label: "Set points", value: "set" }
    );

  const row = new ActionRowBuilder().addComponents(menu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:back:${normalizeName(team.name)}`)
      .setLabel("Back to team")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, backRow];
}

function buildManageTeamsHome(data) {
  const teams = Object.values(data.teams).sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );
  const cappedTeams = teams.slice(0, 25);

  const embed = new EmbedBuilder()
    .setTitle("Manage Teams")
    .setDescription(
      teams.length
        ? `Select a team to manage.${teams.length > 25 ? " (Showing first 25)" : ""}`
        : "No teams yet. Add one with /teams add."
    )
    .setColor(0x22c55e);

  if (!cappedTeams.length) {
    return { embed, components: [] };
  }

  const rows = [];
  for (let i = 0; i < cappedTeams.length; i += 5) {
    const slice = cappedTeams.slice(i, i + 5);
    const row = new ActionRowBuilder().addComponents(
      ...slice.map((team) =>
        new ButtonBuilder()
          .setCustomId(`manageTeams:select:${encodeKey(normalizeName(team.name))}`)
          .setLabel(team.name)
          .setStyle(ButtonStyle.Primary)
      )
    );
    rows.push(row);
  }

  return { embed, components: rows };
}

function buildTeamRosterEmbed(team, data, status) {
  const members = Object.values(data.players).filter(
    (player) => player.team && normalizeName(player.team) === normalizeName(team.name)
  );

  const sorted = members.sort((a, b) => {
    const aPriority = a.captain || a.topPlayer ? 1 : 0;
    const bPriority = b.captain || b.topPlayer ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return a.tag.localeCompare(b.tag, "en", { sensitivity: "base" });
  });

  const lines = sorted.map((player) => {
    const badges = `${player.captain ? "👑" : ""}${player.topPlayer ? "⭐" : ""}`;
    return `${badges ? `${badges} ` : ""}${player.tag}`;
  });

  const descriptionLines = [
    `**Team:** ${team.name}`,
    `**Players:** ${lines.length ? lines.join("\n") : "None yet"}`,
    "**What would you like to manage?**"
  ];

  if (status) {
    descriptionLines.push(`**Last action:** ${status}`);
  }

  return new EmbedBuilder()
    .setTitle(`Manage Team: ${team.name}`)
    .setDescription(descriptionLines.join("\n\n"))
    .setColor(0x22c55e);
}

function buildManageTeamRosterActions(team) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manageTeams:assign:${encodeKey(normalizeName(team.name))}`)
      .setLabel("Player Assignments")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`manageTeams:captain:${encodeKey(normalizeName(team.name))}`)
      .setLabel("Captains")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manageTeams:top:${encodeKey(normalizeName(team.name))}`)
      .setLabel("Top Players")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`manageTeams:done:${encodeKey(normalizeName(team.name))}`)
      .setLabel("I'm done, close this message")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, row2];
}

function buildAssignUnassignMenu(team, data) {
  const players = Object.values(data.players).sort((a, b) =>
    a.tag.localeCompare(b.tag, "en", { sensitivity: "base" })
  );

  const options = players.map((player) => ({
    label: player.tag,
    value: encodeKey(normalizeName(player.tag)),
    description: player.team
      ? `Currently: ${player.team}`
      : "Currently: Unassigned"
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`manageTeams:assignSelect:${encodeKey(normalizeName(team.name))}`)
    .setPlaceholder(options.length ? "Select a player" : "No players yet")
    .setDisabled(!options.length);

  if (options.length) {
    menu.addOptions(options.slice(0, 25));
  }

  const row = new ActionRowBuilder().addComponents(menu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manageTeams:back:${encodeKey(normalizeName(team.name))}`)
      .setLabel("Back to team")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, backRow];
}

function buildCaptainToggleMenu(team, data) {
  const members = Object.values(data.players).filter(
    (player) => player.team && normalizeName(player.team) === normalizeName(team.name)
  );

  const options = members.map((player) => ({
    label: player.tag,
    value: encodeKey(normalizeName(player.tag)),
    description: player.captain ? "Captain" : "Not captain"
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`manageTeams:captainSelect:${encodeKey(normalizeName(team.name))}`)
    .setPlaceholder(options.length ? "Select a team member" : "No members yet")
    .setDisabled(!options.length);

  if (options.length) {
    menu.addOptions(options.slice(0, 25));
  }

  const row = new ActionRowBuilder().addComponents(menu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manageTeams:back:${encodeKey(normalizeName(team.name))}`)
      .setLabel("Back to team")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, backRow];
}

function buildTopPlayerToggleMenu(team, data) {
  const members = Object.values(data.players).filter(
    (player) => player.team && normalizeName(player.team) === normalizeName(team.name)
  );

  const options = members.map((player) => ({
    label: player.tag,
    value: encodeKey(normalizeName(player.tag)),
    description: player.topPlayer ? "Top player" : "Not top player"
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`manageTeams:topSelect:${encodeKey(normalizeName(team.name))}`)
    .setPlaceholder(options.length ? "Select a team member" : "No members yet")
    .setDisabled(!options.length);

  if (options.length) {
    menu.addOptions(options.slice(0, 25));
  }

  const row = new ActionRowBuilder().addComponents(menu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manageTeams:back:${encodeKey(normalizeName(team.name))}`)
      .setLabel("Back to team")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row, backRow];
}

function getPlayerByName(data, name) {
  return data.players[normalizeName(name)];
}

function getTeamByName(data, name) {
  return data.teams[normalizeName(name)];
}

function renamePlayer(data, currentName, nextName) {
  const currentKey = normalizeName(currentName);
  const nextKey = normalizeName(nextName);
  if (!data.players[currentKey]) return { ok: false, error: "Player not found." };
  if (data.players[nextKey] && currentKey !== nextKey) {
    return { ok: false, error: "A player with that name already exists." };
  }

  const player = data.players[currentKey];
  delete data.players[currentKey];
  player.tag = nextName;
  data.players[nextKey] = player;
  return { ok: true, player };
}

function renameTeam(data, currentName, nextName) {
  const currentKey = normalizeName(currentName);
  const nextKey = normalizeName(nextName);
  if (!data.teams[currentKey]) return { ok: false, error: "Team not found." };
  if (data.teams[nextKey] && currentKey !== nextKey) {
    return { ok: false, error: "A team with that name already exists." };
  }

  const team = data.teams[currentKey];
  delete data.teams[currentKey];
  team.name = nextName;
  data.teams[nextKey] = team;

  Object.values(data.players).forEach((player) => {
    if (player.team && normalizeName(player.team) === currentKey) {
      player.team = nextName;
    }
  });

  return { ok: true, team };
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

async function selectMenu({ title, options, hint }) {
  if (!process.stdin.isTTY) {
    return -1;
  }

  readline.emitKeypressEvents(process.stdin);
  let selected = 0;

  const render = () => {
    clearScreen();
    console.log(title);
    if (hint) {
      console.log(hint);
    }
    console.log("");
    options.forEach((option, index) => {
      const marker = index === selected ? "> " : "  ";
      console.log(`${marker}${option}`);
    });
    console.log("");
    console.log("Use ↑/↓ to move, Enter to select, Esc to cancel.");
  };

  render();

  return await new Promise((resolve) => {
    const onKeypress = (str, key) => {
      if (key.name === "up") {
        selected = (selected - 1 + options.length) % options.length;
        render();
      } else if (key.name === "down") {
        selected = (selected + 1) % options.length;
        render();
      } else if (key.name === "return") {
        cleanup();
        resolve(selected);
      } else if (key.name === "escape") {
        cleanup();
        resolve(-1);
      } else if (key.ctrl && key.name === "c") {
        cleanup();
        resolve(-1);
      }
    };

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    process.stdin.on("keypress", onKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
  });
}

async function promptLine(rl, promptText) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  return await new Promise((resolve) => {
    rl.question(promptText, (answer) => resolve(answer));
  });
}

async function managePlayerInteractive(rl, playerName) {
  const data = loadData();
  let player = getPlayerByName(data, playerName);
  if (!player) {
    console.log(`Player not found: ${playerName}`);
    return;
  }

  let keepGoing = true;
  while (keepGoing) {
    const options = [
      "Update name",
      player.topPlayer ? "Unset top player" : "Assign top player",
      player.captain ? "Unset captain" : "Assign captain",
      "Assign team",
      "Back"
    ];

    const choice = await selectMenu({
      title: `Manage player: ${player.tag}`,
      hint: `Team: ${player.team || "Unassigned"}`,
      options
    });

    if (choice === -1 || options[choice] === "Back") {
      keepGoing = false;
      continue;
    }

    if (options[choice] === "Update name") {
      const nextName = (await promptLine(rl, "New player name: ")).trim();
      if (!nextName) continue;
      const result = renamePlayer(data, player.tag, nextName);
      if (!result.ok) {
        console.log(result.error);
        continue;
      }
      player = result.player;
      saveData(data);
      console.log(`Updated player name to ${nextName}`);
    } else if (options[choice] === "Assign team") {
      const teams = Object.values(data.teams).sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" })
      );

      if (!teams.length) {
        console.log("No teams available. Add a team first.");
        continue;
      }

      const teamOptions = ["Unassigned", ...teams.map((team) => team.name)];
      const teamChoice = await selectMenu({
        title: `Assign team for ${player.tag}`,
        options: teamOptions,
        hint: "Pick a team"
      });

      if (teamChoice === -1) continue;
      if (teamOptions[teamChoice] === "Unassigned") {
        player.team = "";
      } else {
        player.team = teamOptions[teamChoice];
      }

      saveData(data);
      console.log(`Team set to ${player.team || "Unassigned"}`);
    } else if (options[choice].includes("top player")) {
      player.topPlayer = !player.topPlayer;
      saveData(data);
      console.log(`Top Player: ${player.topPlayer ? "yes" : "no"}`);
    } else if (options[choice].includes("captain")) {
      player.captain = !player.captain;
      saveData(data);
      console.log(`Captain: ${player.captain ? "yes" : "no"}`);
    }
  }
}

async function manageRosterInteractive(rl, teamName) {
  const data = loadData();
  const team = getTeamByName(data, teamName);
  if (!team) {
    console.log(`Team not found: ${teamName}`);
    return;
  }

  let rosterLoop = true;
  while (rosterLoop) {
    const members = Object.values(data.players).filter(
      (player) => player.team && normalizeName(player.team) === normalizeName(team.name)
    );

    if (!members.length) {
      console.log("No members on this team.");
      return;
    }

    const memberOptions = [...members.map((member) => member.tag), "Back"];
    const memberChoice = await selectMenu({
      title: `Roster: ${team.name}`,
      options: memberOptions
    });

    if (memberChoice === -1 || memberOptions[memberChoice] === "Back") {
      rosterLoop = false;
      continue;
    }

    const member = members[memberChoice];
    let memberLoop = true;
    while (memberLoop) {
      const memberActions = [
        member.captain ? "Unset captain" : "Make captain",
        "Remove from team",
        "Back"
      ];

      const actionChoice = await selectMenu({
        title: `Member: ${member.tag}`,
        hint: `Captain: ${member.captain ? "yes" : "no"}`,
        options: memberActions
      });

      if (actionChoice === -1 || memberActions[actionChoice] === "Back") {
        memberLoop = false;
        continue;
      }

      if (memberActions[actionChoice].includes("captain")) {
        member.captain = !member.captain;
        saveData(data);
        console.log(`Captain: ${member.captain ? "yes" : "no"}`);
      } else if (memberActions[actionChoice] === "Remove from team") {
        member.team = "";
        saveData(data);
        console.log(`Removed ${member.tag} from ${team.name}`);
        memberLoop = false;
      }
    }
  }
}

async function manageTeamInteractive(rl, teamName) {
  const data = loadData();
  let team = getTeamByName(data, teamName);
  if (!team) {
    console.log(`Team not found: ${teamName}`);
    return;
  }

  let keepGoing = true;
  while (keepGoing) {
    const options = ["Update name", "Manage roster", "Back"];
    const choice = await selectMenu({
      title: `Manage team: ${team.name}`,
      hint: `Points: ${team.points ?? 0}`,
      options
    });

    if (choice === -1 || options[choice] === "Back") {
      keepGoing = false;
      continue;
    }

    if (options[choice] === "Update name") {
      const nextName = (await promptLine(rl, "New team name: ")).trim();
      if (!nextName) continue;
      const result = renameTeam(data, team.name, nextName);
      if (!result.ok) {
        console.log(result.error);
        continue;
      }
      team = result.team;
      saveData(data);
      console.log(`Updated team name to ${nextName}`);
    } else if (options[choice] === "Manage roster") {
      await manageRosterInteractive(rl, team.name);
    }
  }
}

function parseCommand(content) {
  const trimmed = content.trim();
  const prefix = COMMAND_PREFIXES.find((p) => trimmed.startsWith(p));
  if (!prefix) return null;

  const raw = trimmed.slice(prefix.length).trim();
  if (!raw) return null;

  const tokens = raw.split(/\s+/);
  return {
    prefix,
    root: tokens[0]?.toLowerCase(),
    action: tokens[1]?.toLowerCase() ?? "",
    args: tokens.slice(2)
  };
}

function handlePlayerCommand(action, args, data) {
  if (action === "add") {
    const name = args.join(" ").trim();
    if (!name) return "Usage: /player add [playerName]";

    const key = normalizeName(name);
    if (data.players[key]) return `Player already exists: ${data.players[key].tag}`;

    data.players[key] = {
      tag: name,
      team: "",
      topPlayer: false,
      captain: false
    };
    saveData(data);
    return `Added player: ${name}`;
  }

  if (action === "assign") {
    const playerName = args[0];
    if (!playerName) return "Usage: /player assign [playerName] (optional target team)";

    const playerKey = normalizeName(playerName);
    const player = data.players[playerKey];
    if (!player) return `Player not found: ${playerName}`;

    const manualTeam = args.slice(1).join(" ").trim();
    if (manualTeam) {
      const team = data.teams[normalizeName(manualTeam)];
      if (!team) return `Team not found: ${manualTeam}`;

      player.team = team.name;
      saveData(data);
      return `Assigned ${player.tag} to ${team.name}`;
    }

    const assignment = chooseTeamForAssignment(player, data);
    if (assignment.error) return assignment.error;

    player.team = assignment.team.name;
    saveData(data);
    return `${assignment.status}`;
  }

  if (action === "manage") {
    const name = args.join(" ").trim();
    if (!name) return "Usage: /player manage [playerName]";

    const player = data.players[normalizeName(name)];
    if (!player) return `Player not found: ${name}`;

    return formatPlayer(player);
  }

  return "Unknown /player command. Try: add, manage";
}

function handleTeamCommand(action, args, data) {
  if (action === "add") {
    const name = args.join(" ").trim();
    if (!name) return "Usage: /team add [teamName]";

    const key = normalizeName(name);
    if (data.teams[key]) return `Team already exists: ${data.teams[key].name}`;

    data.teams[key] = { name, points: 0 };
    saveData(data);
    return `Added team: ${name}`;
  }

  if (action === "manage") {
    const name = args.join(" ").trim();
    if (!name) return "Usage: /team manage [teamName]";

    const team = data.teams[normalizeName(name)];
    if (!team) return `Team not found: ${name}`;

    return formatTeam(team.name, data);
  }

  return "Unknown /team command. Try: add, manage";
}

function handleMessageContent(content) {
  const command = parseCommand(content);
  if (!command) return null;

  const data = loadData();

  if (command.root === "player") {
    return handlePlayerCommand(command.action, command.args, data);
  }

  if (command.root === "teams" && !command.action) {
    return formatTeamList(data);
  }

  if (command.root === "team" || (command.root === "teams" && command.action)) {
    return handleTeamCommand(command.action, command.args, data);
  }

  return "Unknown command.";
}

function handleSlashCommand(interaction) {
  const data = loadData();
  const commandName = interaction.commandName;

  if (commandName === "player") {
    const sub = interaction.options.getSubcommand();
    const args = [];

    if (sub === "add") {
      const name = interaction.options.getString("name", true);
      args.push(name);
      const message = handlePlayerCommand(sub, args, data);
      if (message.startsWith("Added player")) {
        const player = getPlayerByName(data, name);
        if (!player) {
          return { embeds: [new EmbedBuilder().setTitle(message).setColor(0x3b82f6)] };
        }
        return {
          embeds: [buildPlayerAddEmbed(player)],
          components: buildPlayerAddComponents(player)
        };
      }
      return { embeds: [new EmbedBuilder().setTitle(message).setColor(0xef4444)] };
    } else if (sub === "assign") {
      const name = interaction.options.getString("name", true);
      const team = interaction.options.getString("team", false);
      args.push(name);
      if (team) args.push(team);
      const message = handlePlayerCommand(sub, args, data);
      return { embeds: [new EmbedBuilder().setTitle(message).setColor(0x3b82f6)] };
    } else if (sub === "manage") {
      const name = interaction.options.getString("name", true);
      const player = getPlayerByName(data, name);
      if (!player) {
        return {
          embeds: [new EmbedBuilder().setTitle(`Player not found: ${name}`).setColor(0xef4444)]
        };
      }

      return {
        embeds: [buildPlayerEmbed(player)],
        components: buildPlayerManageComponents(player)
      };
    } else if (sub === "list") {
      const players = Object.values(data.players).sort((a, b) =>
        a.tag.localeCompare(b.tag, "en", { sensitivity: "base" })
      );
      const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
      const embed = buildPlayerListEmbed(players, 0);
      const components = players.length ? buildPlayerListComponents(0, totalPages) : [];
      return { embeds: [embed], components };
    }
  }

  if (commandName === "team") {
    const sub = interaction.options.getSubcommand();
    const args = [];
    let action = sub;

    if (sub === "add") {
      args.push(interaction.options.getString("name", true));
      const message = handleTeamCommand(action, args, data);
      return { embeds: [new EmbedBuilder().setTitle(message).setColor(0x22c55e)] };
    } else if (sub === "manage") {
      const name = interaction.options.getString("name", false);
      if (!name) {
        const { embed, components } = buildManageTeamsHome(data);
        return { embeds: [embed], components };
      }
      const team = getTeamByName(data, name);
      if (!team) {
        return {
          embeds: [new EmbedBuilder().setTitle(`Team not found: ${name}`).setColor(0xef4444)]
        };
      }
      return {
        embeds: [buildTeamEmbed(team, data)],
        components: buildTeamManageComponents(team)
      };
    }
  }

  if (commandName === "teams") {
    return { embeds: [buildTeamsListEmbed(data)] };
  }

  return { embeds: [new EmbedBuilder().setTitle("Unknown command.").setColor(0xef4444)] };
}

async function handleComponentInteraction(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  const updateMessage = async (payload) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    return interaction.update(payload);
  };

  const replyEphemeral = async (payload) => {
    const messagePayload = { ...payload, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(messagePayload);
    }
    return interaction.reply(messagePayload);
  };

  const data = loadData();
  const [scope, action, key, extra] = interaction.customId.split(":");

  if (scope === "playerList") {
    const players = Object.values(data.players).sort((a, b) =>
      a.tag.localeCompare(b.tag, "en", { sensitivity: "base" })
    );
    const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
    const direction = key;
    const page = Number(extra ?? 0);

    if (direction === "close") {
      await interaction.message.delete();
      await interaction.deleteReply().catch(() => {});
      return;
    }

    let newPage = page;
    if (direction === "next") {
      newPage = Math.min(totalPages - 1, page + 1);
    } else if (direction === "prev") {
      newPage = Math.max(0, page - 1);
    }

    const embed = buildPlayerListEmbed(players, newPage);
    const components = players.length ? buildPlayerListComponents(newPage, totalPages) : [];
    await updateMessage({ embeds: [embed], components });
    return;
  }

  if (scope === "playerAdd") {
    const player = data.players[key];
    if (!player) {
      await replyEphemeral({
        embeds: [new EmbedBuilder().setTitle("Player not found.").setColor(0xef4444)]
      });
      return;
    }

    if (action === "top") {
      player.topPlayer = !player.topPlayer;
      saveData(data);
      await updateMessage({
        embeds: [buildPlayerAddEmbed(player)],
        components: buildPlayerAddComponents(player)
      });
    }
    return;
  }

  if (scope === "player") {
    const player = data.players[key];
    if (!player) {
      await replyEphemeral({
        embeds: [new EmbedBuilder().setTitle("Player not found.").setColor(0xef4444)]
      });
      return;
    }

    if (action === "toggleTop") {
      player.topPlayer = !player.topPlayer;
      saveData(data);
      await updateMessage({
        embeds: [buildPlayerEmbed(player)],
        components: buildPlayerManageComponents(player)
      });
      return;
    }

    if (action === "toggleCaptain") {
      player.captain = !player.captain;
      saveData(data);
      await updateMessage({
        embeds: [buildPlayerEmbed(player)],
        components: buildPlayerManageComponents(player)
      });
      return;
    }

    if (action === "assignTeam") {
      await updateMessage({
        embeds: [buildPlayerEmbed(player)],
        components: buildAssignTeamMenu(player, data)
      });
      return;
    }

    if (action === "assignTeamBack") {
      await updateMessage({
        embeds: [buildPlayerEmbed(player)],
        components: buildPlayerManageComponents(player)
      });
      await replyEphemeral({
        embeds: [new EmbedBuilder().setTitle("Canceled.").setColor(0x94a3b8)]
      });
      return;
    }

    if (action === "assignTeamSelect") {
      const selection = interaction.values[0];
      if (selection === "__unassigned__") {
        player.team = "";
      } else {
        const team = data.teams[selection];
        player.team = team ? team.name : "";
      }
      saveData(data);
      await updateMessage({
        embeds: [buildPlayerEmbed(player)],
        components: buildPlayerManageComponents(player)
      });
      return;
    }

    if (action === "removeConfirm") {
      await updateMessage({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Remove player: ${player.tag}?`)
            .setDescription("This will delete the player.")
            .setColor(0xef4444)
        ],
        components: buildPlayerRemoveConfirmComponents(player)
      });
      return;
    }

    if (action === "cancelRemove") {
      await updateMessage({
        embeds: [buildPlayerEmbed(player)],
        components: buildPlayerManageComponents(player)
      });
      await replyEphemeral({
        embeds: [new EmbedBuilder().setTitle("Canceled.").setColor(0x94a3b8)]
      });
      return;
    }

    if (action === "remove") {
      delete data.players[key];
      saveData(data);
      await updateMessage({
        embeds: [new EmbedBuilder().setTitle("Player removed.").setColor(0xef4444)],
        components: []
      });
      return;
    }

    if (action === "done") {
      await interaction.message.delete();
      return;
    }

    if (action === "rename") {
      const modal = new ModalBuilder()
        .setCustomId(`player:renameModal:${key}:${interaction.message.id}`)
        .setTitle("Update player name");

      const input = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("New player name")
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setValue(player.tag);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
  }

  if (scope === "team") {
    const team = data.teams[key];
    if (!team) {
      await replyEphemeral({
        embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)]
      });
      return;
    }

    if (action === "back") {
      await updateMessage({
        embeds: [buildTeamEmbed(team, data)],
        components: buildTeamManageComponents(team)
      });
      return;
    }

    if (action === "rename") {
      const modal = new ModalBuilder()
        .setCustomId(`team:renameModal:${key}:${interaction.message.id}`)
        .setTitle("Update team name");

      const input = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("New team name")
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setValue(team.name);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (action === "points") {
      await updateMessage({
        embeds: [buildTeamEmbed(team, data)],
        components: buildAdjustPointsMenu(team)
      });
      return;
    }

    if (action === "pointsSelect") {
      const operation = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`team:pointsModal:${key}:${operation}:${interaction.message.id}`)
        .setTitle("Adjust points");

      const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Amount (whole number)")
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 5");

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (action === "roster") {
      await updateMessage({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Roster: ${team.name}`)
            .setDescription("Select a member to manage.")
            .setColor(0x22c55e)
        ],
        components: buildRosterMenu(team, data)
      });
      return;
    }

    if (action === "rosterSelect") {
      const memberKey = interaction.values[0];
      const member = data.players[memberKey];
      if (!member) {
        await updateMessage({
          embeds: [buildTeamEmbed(team, data)],
          components: buildTeamManageComponents(team)
        });
        return;
      }

      await updateMessage({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Member: ${member.tag}`)
            .setDescription(`Captain: ${member.captain ? "Yes" : "No"}`)
            .setColor(0x3b82f6)
        ],
        components: buildRosterMemberComponents(team, member)
      });
      return;
    }

    if (action === "memberToggleCaptain") {
      const member = data.players[extra];
      if (!member) {
        await updateMessage({
          embeds: [buildTeamEmbed(team, data)],
          components: buildTeamManageComponents(team)
        });
        return;
      }
      member.captain = !member.captain;
      saveData(data);
      await updateMessage({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Member: ${member.tag}`)
            .setDescription(`Captain: ${member.captain ? "Yes" : "No"}`)
            .setColor(0x3b82f6)
        ],
        components: buildRosterMemberComponents(team, member)
      });
      return;
    }

    if (action === "memberRemove") {
      const member = data.players[extra];
      if (!member) {
        await updateMessage({
          embeds: [buildTeamEmbed(team, data)],
          components: buildTeamManageComponents(team)
        });
        return;
      }
      member.team = "";
      saveData(data);
      await updateMessage({
        embeds: [buildTeamEmbed(team, data)],
        components: buildRosterMenu(team, data)
      });
      return;
    }

    if (action === "removeConfirm") {
      await updateMessage({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Remove team: ${team.name}?`)
            .setDescription("This will delete the team and unassign its players.")
            .setColor(0xef4444)
        ],
        components: buildTeamRemoveConfirmComponents(team)
      });
      return;
    }

    if (action === "cancelRemove") {
      await updateMessage({
        embeds: [buildTeamEmbed(team, data)],
        components: buildTeamManageComponents(team)
      });
      await replyEphemeral({
        embeds: [new EmbedBuilder().setTitle("Canceled.").setColor(0x94a3b8)]
      });
      return;
    }

    if (action === "remove") {
      Object.values(data.players).forEach((player) => {
        if (player.team && normalizeName(player.team) === key) {
          player.team = "";
        }
      });
      delete data.teams[key];
      saveData(data);
      await updateMessage({
        embeds: [new EmbedBuilder().setTitle("Team removed.").setColor(0xef4444)],
        components: []
      });
    }
  }

  if (scope === "manageTeams") {
    const teamKey = decodeKey(key);
    if (action === "select") {
      const team = data.teams[teamKey];
      if (!team) {
        await replyEphemeral({
          embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)]
        });
        return;
      }

      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    const team = data.teams[teamKey];
    if (!team) {
      await replyEphemeral({
        embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)]
      });
      return;
    }

    if (action === "assign") {
      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildAssignUnassignMenu(team, data)
      });
      return;
    }

    if (action === "assignSelect") {
      const playerKey = decodeKey(interaction.values[0]);
      const player = data.players[playerKey];
      if (!player) {
        await updateMessage({
          embeds: [buildTeamRosterEmbed(team, data)],
          components: buildManageTeamRosterActions(team)
        });
        return;
      }

      let status = "";
      if (player.team && normalizeName(player.team) === normalizeName(team.name)) {
        player.team = "";
        status = `Unassigned ${player.tag}`;
      } else {
        player.team = team.name;
        status = `Assigned ${player.tag} to ${team.name}`;
      }
      saveData(data);

      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data, status)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "captain") {
      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildCaptainToggleMenu(team, data)
      });
      return;
    }

    if (action === "captainSelect") {
      const playerKey = decodeKey(interaction.values[0]);
      const player = data.players[playerKey];
      if (!player) {
        await updateMessage({
          embeds: [buildTeamRosterEmbed(team, data)],
          components: buildManageTeamRosterActions(team)
        });
        return;
      }

      player.captain = !player.captain;
      saveData(data);

      const status = `${player.captain ? "Added" : "Removed"} captain: ${player.tag}`;
      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data, status)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "top") {
      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildTopPlayerToggleMenu(team, data)
      });
      return;
    }

    if (action === "topSelect") {
      const playerKey = decodeKey(interaction.values[0]);
      const player = data.players[playerKey];
      if (!player) {
        await updateMessage({
          embeds: [buildTeamRosterEmbed(team, data)],
          components: buildManageTeamRosterActions(team)
        });
        return;
      }

      player.topPlayer = !player.topPlayer;
      saveData(data);

      const status = `${player.topPlayer ? "Added" : "Removed"} top player: ${player.tag}`;
      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data, status)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "back") {
      await updateMessage({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "done") {
      await interaction.message.delete();
    }
  }
}

async function handleModalSubmit(interaction) {
  const parts = interaction.customId.split(":");
  const [scope, action, key] = parts;
  const data = loadData();

  if (scope === "player" && action === "renameModal") {
    const player = data.players[key];
    if (!player) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Player not found.").setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    const nextName = interaction.fields.getTextInputValue("name").trim();
    if (!nextName) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Name cannot be empty.").setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    const result = renamePlayer(data, player.tag, nextName);
    if (!result.ok) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle(result.error).setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    saveData(data);
    const channel = interaction.channel;
    const messageId = parts[3];
    if (channel && messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit({
          embeds: [buildPlayerEmbed(result.player)],
          components: buildPlayerManageComponents(result.player)
        });
      } catch (err) {
        console.error("Failed to update player message:", err);
      }
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Player updated.").setColor(0x22c55e)]
    });
    return;
  }

  if (scope === "team" && action === "renameModal") {
    const team = data.teams[key];
    if (!team) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    const nextName = interaction.fields.getTextInputValue("name").trim();
    if (!nextName) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Name cannot be empty.").setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    const result = renameTeam(data, team.name, nextName);
    if (!result.ok) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle(result.error).setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    saveData(data);
    const channel = interaction.channel;
    const messageId = parts[3];
    if (channel && messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit({
          embeds: [buildTeamEmbed(result.team, data)],
          components: buildTeamManageComponents(result.team)
        });
      } catch (err) {
        console.error("Failed to update team message:", err);
      }
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Team updated.").setColor(0x22c55e)]
    });
    return;
  }

  if (scope === "team" && action === "pointsModal") {
    const operation = parts[3];
    const messageId = parts[4];
    const team = data.teams[key];
    if (!team) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    const amountRaw = interaction.fields.getTextInputValue("amount").trim();
    const amount = Number.parseInt(amountRaw, 10);
    if (!Number.isFinite(amount)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Amount must be a whole number.").setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    if (operation === "add") {
      team.points = (team.points ?? 0) + amount;
    } else if (operation === "deduct") {
      team.points = (team.points ?? 0) - amount;
    } else if (operation === "set") {
      team.points = amount;
    }
    saveData(data);

    const channel = interaction.channel;
    if (channel && messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit({
          embeds: [buildTeamEmbed(team, data)],
          components: buildTeamManageComponents(team)
        });
      } catch (err) {
        console.error("Failed to update team points message:", err);
      }
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Points updated.").setColor(0x22c55e)]
    });
  }

  if (scope === "manageTeams") {
    const teamKey = decodeKey(key);
    if (action === "select") {
      const team = data.teams[teamKey];
      if (!team) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)],
          ephemeral: true
        });
        return;
      }

      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    const team = data.teams[teamKey];
    if (!team) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)],
        ephemeral: true
      });
      return;
    }

    if (action === "assign") {
      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildAssignUnassignMenu(team, data)
      });
      return;
    }

    if (action === "assignSelect") {
      const playerKey = decodeKey(interaction.values[0]);
      const player = data.players[playerKey];
      if (!player) {
        await interaction.update({
          embeds: [buildTeamRosterEmbed(team, data)],
          components: buildManageTeamRosterActions(team)
        });
        return;
      }

      let status = "";
      if (player.team && normalizeName(player.team) === normalizeName(team.name)) {
        player.team = "";
        status = `Unassigned ${player.tag}`;
      } else {
        player.team = team.name;
        status = `Assigned ${player.tag} to ${team.name}`;
      }
      saveData(data);

      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data, status)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "captain") {
      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildCaptainToggleMenu(team, data)
      });
      return;
    }

    if (action === "captainSelect") {
      const playerKey = decodeKey(interaction.values[0]);
      const player = data.players[playerKey];
      if (!player) {
        await interaction.update({
          embeds: [buildTeamRosterEmbed(team, data)],
          components: buildManageTeamRosterActions(team)
        });
        return;
      }

      player.captain = !player.captain;
      saveData(data);

      const status = `${player.captain ? "Added" : "Removed"} captain: ${player.tag}`;
      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data, status)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "top") {
      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildTopPlayerToggleMenu(team, data)
      });
      return;
    }

    if (action === "topSelect") {
      const playerKey = decodeKey(interaction.values[0]);
      const player = data.players[playerKey];
      if (!player) {
        await interaction.update({
          embeds: [buildTeamRosterEmbed(team, data)],
          components: buildManageTeamRosterActions(team)
        });
        return;
      }

      player.topPlayer = !player.topPlayer;
      saveData(data);

      const status = `${player.topPlayer ? "Added" : "Removed"} top player: ${player.tag}`;
      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data, status)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "back") {
      await interaction.update({
        embeds: [buildTeamRosterEmbed(team, data)],
        components: buildManageTeamRosterActions(team)
      });
      return;
    }

    if (action === "done") {
      await interaction.message.delete();
    }
  }
}

async function runDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("Missing DISCORD_BOT_TOKEN. Add it to your environment or .env file.");
    process.exit(1);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.type === InteractionType.ModalSubmit) {
      await handleModalSubmit(interaction);
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      try {
        await handleComponentInteraction(interaction);
      } catch (err) {
        console.error("Failed to handle component interaction:", err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Something went wrong handling that action.")
                .setDescription(`Action: ${interaction.customId}`)
                .setColor(0xef4444)
            ],
            ephemeral: true
          });
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
      const response = handleSlashCommand(interaction);
      await interaction.reply(response);
    } catch (err) {
      console.error("Failed to handle interaction:", err);
      if (!interaction.replied) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle("Something went wrong.").setColor(0xef4444)],
          ephemeral: true
        });
      }
    }
  });

  await client.login(token);
}

function runLocalTest(inputText) {
  const response = handleMessageContent(inputText);
  if (response) {
    console.log(response);
  } else {
    console.log("(no response)");
  }
}

function runLocalTestInteractive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "local> "
  });

  console.log("Local test mode. Type a message (try /help). Press Ctrl+C to exit.");
  rl.prompt();

  rl.on("line", async (line) => {
    const command = parseCommand(line);
    if (command && command.root === "player" && command.action === "manage") {
      const playerName = command.args.join(" ").trim();
      if (!playerName) {
        console.log("Usage: /player manage [playerName]");
      } else {
        await managePlayerInteractive(rl, playerName);
      }
    } else if (command && command.root === "team" && command.action === "manage") {
      const teamName = command.args.join(" ").trim();
      if (!teamName) {
        console.log("Usage: /team manage [teamName]");
      } else {
        await manageTeamInteractive(rl, teamName);
      }
    } else {
      runLocalTest(line);
    }
    rl.prompt();
  });
}

const args = process.argv.slice(2);
const testIndex = args.indexOf("--test");

if (testIndex !== -1) {
  const inlineText = args.slice(testIndex + 1).join(" ");
  if (inlineText) {
    runLocalTest(inlineText);
  } else {
    runLocalTestInteractive();
  }
} else {
  runDiscordBot();
}

export { handleMessageContent };
