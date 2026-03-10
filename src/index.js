import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  InteractionType,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
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
const DATA_DIR = process.env.BOT_DATA_DIR
  ? path.resolve(process.env.BOT_DATA_DIR)
  : path.resolve("data");
const DATA_PATH = process.env.BOT_DATA_PATH
  ? path.resolve(process.env.BOT_DATA_PATH)
  : path.join(DATA_DIR, "data.json");
const PAGE_SIZE = 10;
const scoreSessions = new Map();
const eventAddSessions = new Map();
const EVENT_REGION_CONFIG = Object.freeze({
  semo: { label: "SEMO", color: 0x7a1f1f },
  rolla: { label: "Rolla", color: 0x10b981 },
  springfield: { label: "Springfield", color: 0xf59e0b },
  stl: { label: "St. Louis", color: 0x2563eb },
  kc: { label: "Kansas City", color: 0xef4444 },
  como: { label: "CoMo", color: 0x06b6d4 },
  soil: { label: "SoIL", color: 0x84cc16 },
  wky: { label: "WKY", color: 0xeab308 },
  regional: { label: "Regional", color: 0x64748b },
  major: { label: "Major", color: 0xf97316 }
});
const EVENT_CATEGORY_CONFIG = Object.freeze({
  local: { label: "SEMO Events", color: 0x7a1f1f },
  moNearby: { label: "Missouri and Nearby Region Events", color: 0x2563eb },
  regionalMajor: { label: "Regional/Major Events", color: 0xf97316 }
});
const CATEGORY_ORDER = Object.freeze(["local", "moNearby", "regionalMajor"]);
const REGION_TO_CATEGORY = Object.freeze({
  semo: "local",
  stl: "moNearby",
  kc: "moNearby",
  rolla: "moNearby",
  como: "moNearby",
  soil: "moNearby",
  springfield: "moNearby",
  wky: "moNearby",
  regional: "regionalMajor",
  major: "regionalMajor"
});

function getDefaultEventRegionColors() {
  return Object.fromEntries(
    Object.entries(EVENT_REGION_CONFIG).map(([key, value]) => [key, value.color])
  );
}

function createInitialData() {
  return {
    players: {},
    teams: {},
    settings: {
      guilds: {}
    },
    events: {
      items: {},
      publishedMessages: {},
      regionColors: getDefaultEventRegionColors()
    }
  };
}

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

function isUnknownInteractionError(err) {
  return Number(err?.code) === 10062 || Number(err?.rawError?.code) === 10062;
}

async function safeReplyInteraction(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      console.warn("Skipped response because interaction expired.");
      return null;
    }
    throw err;
  }
}

function ensureDataDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureEventsStore(data) {
  if (!data.events || typeof data.events !== "object") {
    data.events = {};
  }
  if (!data.events.items || typeof data.events.items !== "object") {
    data.events.items = {};
  }
  if (!data.events.publishedMessages || typeof data.events.publishedMessages !== "object") {
    data.events.publishedMessages = {};
  }
  if (!data.events.regionColors || typeof data.events.regionColors !== "object") {
    data.events.regionColors = {};
  }
  if (typeof data.events.boardMessageId !== "string") {
    data.events.boardMessageId = "";
  }
  if (typeof data.events.boardChannelId !== "string") {
    data.events.boardChannelId = "";
  }

  const defaults = getDefaultEventRegionColors();
  Object.entries(defaults).forEach(([key, color]) => {
    if (data.events.regionColors[key] == null) {
      data.events.regionColors[key] = color;
    }
  });

  return data.events;
}

function ensureSettingsStore(data) {
  if (!data.settings || typeof data.settings !== "object") {
    data.settings = {};
  }
  if (!data.settings.guilds || typeof data.settings.guilds !== "object") {
    data.settings.guilds = {};
  }
  return data.settings;
}

function getGuildSettings(data, guildId) {
  if (!guildId) return null;
  const settings = ensureSettingsStore(data);
  if (!settings.guilds[guildId] || typeof settings.guilds[guildId] !== "object") {
    settings.guilds[guildId] = {};
  }
  return settings.guilds[guildId];
}

function resolveEventsChannelConfig(data, guildId) {
  const guildSettings = getGuildSettings(data, guildId);
  return {
    commandChannelId:
      guildSettings?.eventsCommandChannelId ||
      process.env.EVENTS_COMMAND_CHANNEL_ID ||
      "",
    publishChannelId:
      guildSettings?.eventsPublishChannelId ||
      process.env.EVENTS_PUBLISH_CHANNEL_ID ||
      ""
  };
}

function loadData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_PATH)) {
    return createInitialData();
  }

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    Object.values(parsed.players ?? {}).forEach((player) => {
      if (player.points == null) player.points = 0;
      if (player.topPlayer == null) player.topPlayer = false;
      if (player.captain == null) player.captain = false;
    });
    const data = {
      players: parsed.players ?? {},
      teams: parsed.teams ?? {},
      settings: parsed.settings ?? {},
      events: parsed.events ?? {}
    };
    ensureSettingsStore(data);
    ensureEventsStore(data);
    return data;
  } catch (err) {
    console.error("Failed to read data.json, starting fresh:", err);
    return createInitialData();
  }
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function resetData() {
  ensureDataDir();
  const nextData = createInitialData();
  const tempPath = `${DATA_PATH}.tmp`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(nextData, null, 2));
    fs.renameSync(tempPath, DATA_PATH);
    scoreSessions.clear();
    return { ok: true, data: nextData };
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Best effort cleanup for failed reset writes.
      }
    }
    return { ok: false, error: err };
  }
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

function buildScoresMenuEmbed() {
  return new EmbedBuilder()
    .setTitle("Add or remove points")
    .setDescription("Select the team that scored and enter the details.")
    .setColor(0xf97316);
}

function buildScoresMenuComponents(data) {
  const teams = Object.values(data.teams).sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );
  if (!teams.length) return [];
  const rows = [];
  for (let i = 0; i < teams.length; i += 5) {
    const slice = teams.slice(i, i + 5);
    const row = new ActionRowBuilder().addComponents(
      ...slice.map((team) =>
        new ButtonBuilder()
          .setCustomId(`scores:select:${encodeKey(normalizeName(team.name))}`)
          .setLabel(team.name)
          .setStyle(ButtonStyle.Primary)
      )
    );
    rows.push(row);
  }
  return rows;
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

function buildPointsEmbed(data) {
  const teams = Object.values(data.teams).sort((a, b) =>
    (b.points ?? 0) - (a.points ?? 0)
  );
  const descriptionLines = teams.length
    ? teams.map((team) => `**${team.name}** — ${team.points ?? 0} pts`)
    : ["No teams yet."];

  const allPlayers = Object.values(data.players).slice();
  allPlayers.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const topPlayers = allPlayers.slice(0, 6);
  const topLines = topPlayers.map(
    (player) =>
      `${player.topPlayer ? "⭐" : ""}${player.captain ? "👑" : ""} ${player.tag}: ${
        player.points ?? 0
      } pts`
  );

  return new EmbedBuilder()
    .setTitle("Current Scores")
    .setDescription(`${descriptionLines.join("\n")}\n\nTop Scorers:\n${topLines.join("\n")}`)
    .setColor(0x22c55e);
}

function buildScoresAddEmbed(team, session, data) {
  const pointsValue =
    session?.points != null ? `${session.points} pts` : "Not set yet";
  const playerValue =
    session?.playerKey && session.playerKey !== "__team__"
      ? data.players[session.playerKey]?.tag ?? "Unknown player"
      : "Team (all players)";

  return new EmbedBuilder()
    .setTitle(`Adding points to ${team.name}`)
    .setDescription(
      [
        `**Points:** ${pointsValue}`,
        `**Player target:** ${playerValue}`
      ].join("\n")
    )
    .setColor(0xf97316);
}

function buildScoresAddComponents(team, session, messageId, data) {
  const players = Object.values(data.players).filter(
    (player) => player.team && normalizeName(player.team) === normalizeName(team.name)
  );
  const options = players.map((player) => ({
    label: player.tag,
    value: normalizeName(player.tag),
    description: player.points ? `${player.points} pts` : "No points"
  }));
  options.unshift({ label: "Entire team", value: "__team__", description: "Add to team score only" });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`scores:playerSelect:${encodeKey(normalizeName(team.name))}`)
    .setPlaceholder("Who scored the points?")
    .addOptions(options)
    .setMinValues(1)
    .setMaxValues(1);
  if (session?.playerKey) {
    select.setDefaultOptions([
      {
        label: session.playerKey === "__team__" ? "Entire team" : data.players[session.playerKey]?.tag ?? "Unknown",
        value: session.playerKey
      }
    ]);
  }

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`scores:pointsModal:${encodeKey(normalizeName(team.name))}:${messageId}`)
        .setLabel("Add how many points?")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`scores:confirm:${encodeKey(normalizeName(team.name))}:${messageId}`)
        .setLabel("Confirm")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!session?.points),
      new ButtonBuilder()
        .setCustomId(`scores:cancel:${encodeKey(normalizeName(team.name))}:${messageId}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function createEventId() {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function parseIsoDate(value) {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatEventDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatMonthLabel(monthKey) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function resolveMonthSelection(interaction) {
  const now = new Date();
  const month = interaction.options.getInteger("month", false) ?? now.getMonth() + 1;
  const year = interaction.options.getInteger("year", false) ?? now.getFullYear();
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return { month, year, monthKey, label: formatMonthLabel(monthKey) };
}

function validateRegisterUrl(value) {
  return /^https?:\/\//i.test(value.trim());
}

function cleanAddress(value) {
  if (!value) return "";
  return value
    .replace(/,\s*USA\b/gi, "")
    .replace(/,\s*US\b/gi, "")
    .replace(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?(?=,|$)/g, ", $1")
    .replace(/\s+/g, " ")
    .trim();
}

function validateStartGgInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9][a-z0-9-]*$/i.test(trimmed) || /^tournament\/[a-z0-9-]+$/i.test(trimmed);
}

function validateRegisterReference(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (validateRegisterUrl(trimmed)) return true;
  return validateStartGgInput(trimmed);
}

function normalizeRegisterReference(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (validateRegisterUrl(trimmed)) return trimmed;
  const normalized = trimmed.replace(/^\/+/, "");
  if (/^tournament\/[a-z0-9-]+$/i.test(normalized)) {
    return `https://start.gg/${normalized.toLowerCase()}`;
  }
  return `https://start.gg/${normalized.toLowerCase()}`;
}

function parseStartGgSlug(input) {
  try {
    const raw = input.trim();
    if (!raw) return null;

    if (!/^https?:\/\//i.test(raw)) {
      const normalized = raw.replace(/^\/+/, "");
      if (/^tournament\/[a-z0-9-]+$/i.test(normalized)) {
        return { kind: "tournament", slug: normalized.toLowerCase() };
      }
      if (/^[a-z0-9][a-z0-9-]*$/i.test(normalized)) {
        return { kind: "tournament", slug: `tournament/${normalized.toLowerCase()}` };
      }
      return null;
    }

    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const tournamentIndex = parts.indexOf("tournament");
    const eventIndex = parts.indexOf("event");
    if (tournamentIndex === -1) return null;

    const tournamentSlug = parts[tournamentIndex + 1];
    if (!tournamentSlug) return null;

    if (eventIndex !== -1) {
      const eventSlug = parts[eventIndex + 1];
      if (!eventSlug) return null;
      return {
        kind: "event",
        slug: `tournament/${tournamentSlug}/event/${eventSlug}`
      };
    }

    return { kind: "tournament", slug: `tournament/${tournamentSlug}` };
  } catch {
    return null;
  }
}

async function importStartGgEvent(startGgUrl) {
  const token = process.env.START_GG_API_TOKEN;
  if (!token) {
    return { ok: false, error: "Missing START_GG_API_TOKEN in environment." };
  }

  const parsedSlug = parseStartGgSlug(startGgUrl);
  if (!parsedSlug) {
    return {
      ok: false,
      error:
        "Use a valid start.gg URL like /tournament/{slug} or /tournament/{slug}/event/{slug}."
    };
  }

  const eventQuery = `
      query EventBySlug($slug: String!) {
        event(slug: $slug) {
          slug
          name
          startAt
          tournament {
            slug
            name
            venueAddress
            city
            addrState
          }
        }
      }
    `;

  const tournamentQuery = `
      query TournamentBySlug($slug: String!) {
        tournament(slug: $slug) {
          slug
          name
          startAt
          venueAddress
          city
          addrState
          events {
            name
            startAt
          }
        }
      }
    `;

  try {
    const slugCandidates =
      parsedSlug.kind === "tournament"
        ? [parsedSlug.slug, parsedSlug.slug.replace(/^tournament\//i, "")]
        : [parsedSlug.slug];

    let payload = null;
    for (const candidate of slugCandidates) {
      const response = await fetch("https://api.start.gg/gql/alpha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: parsedSlug.kind === "event" ? eventQuery : tournamentQuery,
          variables: { slug: candidate }
        })
      });

      if (!response.ok) {
        continue;
      }

      const candidatePayload = await response.json();
      if (candidatePayload.errors?.length) {
        continue;
      }

      if (
        (parsedSlug.kind === "event" && candidatePayload?.data?.event) ||
        (parsedSlug.kind === "tournament" && candidatePayload?.data?.tournament)
      ) {
        payload = candidatePayload;
        break;
      }
    }

    if (!payload) {
      return { ok: false, error: "Tournament/event not found for that start.gg reference." };
    }

    if (parsedSlug.kind === "event") {
      const event = payload?.data?.event;
      if (!event) {
        return { ok: false, error: "Event not found on start.gg." };
      }

      const date =
        Number.isFinite(event.startAt) && event.startAt > 0
          ? new Date(event.startAt * 1000).toISOString().slice(0, 10)
          : "";
      const tournament = event.tournament ?? {};
      const fallbackAddress = [tournament.city, tournament.addrState].filter(Boolean).join(", ");
      const address = cleanAddress(tournament.venueAddress || fallbackAddress);

      return {
        ok: true,
        data: {
          name: event.name ?? "",
          date,
          address,
          registerUrl: normalizeRegisterReference(startGgUrl)
        }
      };
    }

    const tournament = payload?.data?.tournament;
    if (!tournament) {
      return { ok: false, error: "Tournament not found on start.gg." };
    }

    const eventsList = Array.isArray(tournament.events)
      ? tournament.events
      : tournament.events?.nodes ?? [];
    const firstEvent = eventsList[0] ?? null;
    const startAt = firstEvent?.startAt ?? tournament.startAt ?? 0;
    const date =
      Number.isFinite(startAt) && startAt > 0
        ? new Date(startAt * 1000).toISOString().slice(0, 10)
        : "";

    const fallbackAddress = [tournament.city, tournament.addrState].filter(Boolean).join(", ");
    const address = cleanAddress(tournament.venueAddress || fallbackAddress);

    return {
      ok: true,
      data: {
        name: tournament.name || firstEvent?.name || "",
        date,
        address,
        registerUrl: normalizeRegisterReference(startGgUrl)
      }
    };
  } catch (err) {
    return { ok: false, error: err.message ?? "Failed to call start.gg API." };
  }
}

function getRegionLabel(regionKey) {
  return EVENT_REGION_CONFIG[regionKey]?.label ?? regionKey.toUpperCase();
}

function normalizeRegionInput(value) {
  const raw = value.trim().toLowerCase();
  const compact = raw.replace(/[\s.-]/g, "");
  const aliases = {
    semo: "semo",
    rolla: "rolla",
    stl: "stl",
    stlouis: "stl",
    kansascity: "kc",
    kc: "kc",
    como: "como",
    columbia: "como",
    springfield: "springfield",
    spfd: "springfield",
    soil: "soil",
    southernillinois: "soil",
    wky: "wky",
    westernkentucky: "wky",
    regional: "regional",
    major: "major"
  };
  return aliases[compact] ?? null;
}

function getCategoryKeyForRegion(regionKey) {
  return REGION_TO_CATEGORY[regionKey] ?? null;
}

function getCategoryLabel(categoryKey) {
  return EVENT_CATEGORY_CONFIG[categoryKey]?.label ?? "Events";
}

function getCategoryColor(categoryKey) {
  return EVENT_CATEGORY_CONFIG[categoryKey]?.color ?? 0x64748b;
}

function getRegionColor(data, regionKey) {
  const events = ensureEventsStore(data);
  return events.regionColors[regionKey] ?? 0x64748b;
}

function getEventsForMonth(data, monthKey) {
  const eventsStore = ensureEventsStore(data);
  return Object.values(eventsStore.items)
    .filter((event) => event.date?.startsWith(`${monthKey}-`))
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
}

function buildEventEmbed(event, data) {
  const description = [
    `**${event.name}**`,
    `Region: ${getRegionLabel(event.region)}`,
    `Date: ${formatEventDate(event.date)}`,
    `Where: ${event.address}`,
    `Register: ${event.registerUrl}`
  ];
  if (event.notes) {
    description.push(`**Notes:** ${event.notes}`);
  }

  return new EmbedBuilder()
    .setTitle(`${getRegionLabel(event.region)} Events`)
    .setDescription(description.join("\n"))
    .setColor(getRegionColor(data, event.region));
}

function buildCategorySectionEmbed(categoryKey, events) {
  const lines = [];
  const showRegionLine = categoryKey !== "local";
  events.forEach((event) => {
    lines.push(`**${event.name}**`);
    if (showRegionLine) {
      lines.push(`Region: ${getRegionLabel(event.region)}`);
    }
    lines.push(`Date: ${formatEventDate(event.date)}`);
    lines.push(`Where: ${event.address}`);
    lines.push(`Register: ${event.registerUrl}`);
    lines.push("");
  });

  const description = lines.join("\n").trim() || "No events currently listed.";
  return new EmbedBuilder()
    .setTitle(getCategoryLabel(categoryKey))
    .setDescription(description)
    .setColor(getCategoryColor(categoryKey));
}

function buildCategoryBoardEmbeds(data) {
  const eventsStore = ensureEventsStore(data);
  const events = Object.values(eventsStore.items).sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });

  const grouped = new Map();
  events.forEach((event) => {
    const regionKey = normalizeRegionInput(event.region ?? "");
    const categoryKey = regionKey ? getCategoryKeyForRegion(regionKey) : null;
    if (!categoryKey) return;
    const current = grouped.get(categoryKey) ?? [];
    current.push(event);
    grouped.set(categoryKey, current);
  });

  const embeds = [];
  CATEGORY_ORDER.forEach((categoryKey) => {
    const categoryEvents = grouped.get(categoryKey);
    if (!categoryEvents?.length) return;
    embeds.push(buildCategorySectionEmbed(categoryKey, categoryEvents));
  });
  return embeds;
}

async function syncEventsBoard(interaction, data) {
  const eventsStore = ensureEventsStore(data);
  const { publishChannelId } = resolveEventsChannelConfig(data, interaction.guildId);
  if (!publishChannelId) {
    return {
      ok: false,
      error:
        "No events publish channel configured. Use /setup channels in this server (or set EVENTS_PUBLISH_CHANNEL_ID)."
    };
  }

  const channel = interaction.guild
    ? await interaction.guild.channels.fetch(publishChannelId).catch(() => null)
    : await interaction.client.channels.fetch(publishChannelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    return {
      ok: false,
      error:
        "Could not access the configured publish channel. Re-run /setup channels or verify channel permissions."
    };
  }
  if (!("send" in channel) || typeof channel.send !== "function") {
    return {
      ok: false,
      error: "Configured publish channel is not sendable by the bot."
    };
  }

  if (interaction.guild && interaction.client.user) {
    const permissions = channel.permissionsFor(interaction.client.user.id);
    const required = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.ReadMessageHistory
    ];
    const missing = required.filter((perm) => !permissions?.has(perm));
    if (missing.length) {
      const missingLabels = missing.map((perm) => {
        switch (perm) {
          case PermissionsBitField.Flags.ViewChannel:
            return "ViewChannel";
          case PermissionsBitField.Flags.SendMessages:
            return "SendMessages";
          case PermissionsBitField.Flags.EmbedLinks:
            return "EmbedLinks";
          case PermissionsBitField.Flags.ReadMessageHistory:
            return "ReadMessageHistory";
          default:
            return String(perm);
        }
      });
      return {
        ok: false,
        error: `Missing bot permissions in publish channel: ${missingLabels.join(", ")}.`
      };
    }
  }

  const embeds = buildCategoryBoardEmbeds(data);
  const content = "Upcoming Events By Region";
  let message = null;
  const guildKey = interaction.guildId || "__default";
  const trackedMessage = eventsStore.publishedMessages[guildKey];

  if (trackedMessage?.messageId && trackedMessage.channelId === publishChannelId) {
    message = await channel.messages.fetch(trackedMessage.messageId).catch(() => null);
  } else if (eventsStore.boardMessageId && eventsStore.boardChannelId === publishChannelId) {
    message = await channel.messages.fetch(eventsStore.boardMessageId).catch(() => null);
  }

  try {
    if (message) {
      await message.edit({ content, embeds });
    } else {
      message = await channel.send({ content, embeds });
    }
  } catch (err) {
    const code = Number(err?.code);
    if (code === 50001) {
      return {
        ok: false,
        error: "Discord denied access to the publish channel (Missing Access). Check channel visibility for the bot."
      };
    }
    if (code === 50013) {
      return {
        ok: false,
        error:
          "Discord denied posting in the publish channel (Missing Permissions). Ensure Send Messages and Embed Links are allowed."
      };
    }
    return {
      ok: false,
      error: `Failed to publish events board: ${err?.message ?? "unknown error"}`
    };
  }

  eventsStore.boardMessageId = message.id;
  eventsStore.boardChannelId = publishChannelId;
  eventsStore.publishedMessages[guildKey] = {
    messageId: message.id,
    channelId: publishChannelId
  };
  saveData(data);
  return { ok: true, messageId: message.id };
}

function buildEventsListEmbed(events, label) {
  if (!events.length) {
    return new EmbedBuilder()
      .setTitle(`Events: ${label}`)
      .setDescription("No events found for this month.")
      .setColor(0x64748b);
  }

  const lines = events.map(
    (event) =>
      `\`${event.id}\` — **${event.name}** (${getRegionLabel(event.region)})\n${formatEventDate(
        event.date
      )}`
  );

  return new EmbedBuilder()
    .setTitle(`Events: ${label}`)
    .setDescription(lines.join("\n\n"))
    .setColor(0x3b82f6);
}

function buildEventAddModal(sessionId, session) {
  const { startGgUrl = "", imported = null } = session ?? {};
  const modal = new ModalBuilder()
    .setCustomId(`events:addModal:${sessionId}`)
    .setTitle("Add upcoming event");

  const nameInput = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Event name")
    .setStyle(TextInputStyle.Short)
    .setRequired(!startGgUrl)
    .setPlaceholder(startGgUrl ? "Leave blank to import from start.gg" : "Raffle Rumble 67");
  if (imported?.name) {
    nameInput.setValue(imported.name.slice(0, 100));
  }

  const dateInput = new TextInputBuilder()
    .setCustomId("date")
    .setLabel("Date (YYYY-MM-DD)")
    .setStyle(TextInputStyle.Short)
    .setRequired(!startGgUrl)
    .setPlaceholder(startGgUrl ? "Leave blank to import from start.gg" : "2027-03-01");
  if (imported?.date) {
    dateInput.setValue(imported.date.slice(0, 10));
  }

  const addressInput = new TextInputBuilder()
    .setCustomId("address")
    .setLabel("Where (address/city)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(!startGgUrl)
    .setPlaceholder(
      startGgUrl ? "Leave blank to import from start.gg" : "1100 S Broadview 11 & 12, Cape Girardeau MO"
    );
  if (imported?.address) {
    addressInput.setValue(imported.address.slice(0, 4000));
  }

  const registerInput = new TextInputBuilder()
    .setCustomId("registerUrl")
    .setLabel("Register URL")
    .setStyle(TextInputStyle.Short)
    .setRequired(!startGgUrl)
    .setPlaceholder("https://start.gg/example");
  const registerPrefill = imported?.registerUrl || (startGgUrl ? normalizeRegisterReference(startGgUrl) : "");
  if (registerPrefill) {
    registerInput.setValue(registerPrefill.slice(0, 100));
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(dateInput),
    new ActionRowBuilder().addComponents(addressInput),
    new ActionRowBuilder().addComponents(registerInput)
  );
  return modal;
}

function buildRegionSelectionEmbed() {
  return new EmbedBuilder()
    .setTitle("Select Region")
    .setDescription("Choose the region for this event to finish saving it.")
    .setColor(0x3b82f6);
}

function buildRegionSelectionComponents(sessionId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`eventsAdd:regionSelect:${sessionId}`)
    .setPlaceholder("Select a region")
    .addOptions(
      { label: "SEMO", value: "semo" },
      { label: "Rolla", value: "rolla" },
      { label: "St. Louis", value: "stl" },
      { label: "Kansas City", value: "kc" },
      { label: "CoMo", value: "como" },
      { label: "SoIL", value: "soil" },
      { label: "Springfield", value: "springfield" },
      { label: "WKY", value: "wky" },
      { label: "Regional", value: "regional" },
      { label: "Major", value: "major" }
    );
  return [new ActionRowBuilder().addComponents(menu)];
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
      captain: false,
      points: 0
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

function handleScoresCommand(action, args, data) {
  if (action === "add") {
    return "Use the interactive `/scores add` command in Discord to add or remove points.";
  }
  return "Unknown /scores command.";
}

async function handleEventsCommand(interaction, data) {
  const sub = interaction.options.getSubcommand();
  const eventsStore = ensureEventsStore(data);
  const { commandChannelId } = resolveEventsChannelConfig(data, interaction.guildId);

  if (commandChannelId && interaction.channelId !== commandChannelId) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("Use events commands in the configured command channel.")
          .setDescription(`Command channel: <#${commandChannelId}>`)
          .setColor(0xef4444)
      ],
      flags: MessageFlags.Ephemeral
    };
  }

  if (sub === "add") {
    const startGgUrl = interaction.options.getString("startgg_url", false)?.trim() ?? "";

    if (startGgUrl && !validateStartGgInput(startGgUrl)) {
      return {
        embeds: [
          new EmbedBuilder()
            .setTitle("Invalid start.gg reference.")
            .setDescription("Use a full start.gg URL or a short tournament slug like `raffle-rumble`.")
            .setColor(0xef4444)
        ],
        flags: MessageFlags.Ephemeral
      };
    }

    const imported = null;
    const importStatus = startGgUrl
      ? "start.gg reference received. Submit the modal to auto-import available fields."
      : "";

    eventAddSessions.set(interaction.id, {
      startGgUrl,
      imported,
      importStatus
    });

    const modal = buildEventAddModal(interaction.id, {
      startGgUrl,
      imported,
      importStatus
    });
    await interaction.showModal(modal);
    return null;
  }

  if (sub === "edit") {
    const id = interaction.options.getString("id", true).trim();
    const event = eventsStore.items[id];
    if (!event) {
      return {
        embeds: [new EmbedBuilder().setTitle(`Event not found: ${id}`).setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      };
    }

    const nextName = interaction.options.getString("name", false)?.trim();
    const nextDateRaw = interaction.options.getString("date", false)?.trim();
    const nextRegion = interaction.options.getString("region", false);
    const nextAddress = interaction.options.getString("address", false)?.trim();
    const nextRegisterUrl = interaction.options.getString("register_url", false)?.trim();
    const nextNotes = interaction.options.getString("notes", false)?.trim();

    const changed = [];
    if (nextName) {
      event.name = nextName;
      changed.push("name");
    }
    if (nextDateRaw != null) {
      const parsed = parseIsoDate(nextDateRaw);
      if (!parsed) {
        return {
          embeds: [new EmbedBuilder().setTitle("Date must use YYYY-MM-DD format.").setColor(0xef4444)],
          flags: MessageFlags.Ephemeral
        };
      }
      event.date = parsed;
      changed.push("date");
    }
    if (nextRegion) {
      event.region = nextRegion;
      changed.push("region");
    }
    if (nextAddress) {
      event.address = nextAddress;
      changed.push("address");
    }
    if (nextRegisterUrl != null) {
      if (!validateRegisterReference(nextRegisterUrl)) {
        return {
          embeds: [new EmbedBuilder().setTitle("Register must be a URL or start.gg slug.").setColor(0xef4444)],
          flags: MessageFlags.Ephemeral
        };
      }
      event.registerUrl = normalizeRegisterReference(nextRegisterUrl);
      changed.push("register_url");
    }
    if (nextNotes != null) {
      event.notes = nextNotes;
      changed.push("notes");
    }

    if (!changed.length) {
      return {
        embeds: [
          new EmbedBuilder()
            .setTitle("No changes provided.")
            .setDescription("Provide at least one field to update.")
            .setColor(0xef4444)
        ],
        flags: MessageFlags.Ephemeral
      };
    }

    saveData(data);
    await syncEventsBoard(interaction, data);
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle(`Event updated: ${event.name}`)
          .setDescription(`Updated: ${changed.join(", ")}`)
          .setColor(0x22c55e),
        buildEventEmbed(event, data)
      ]
    };
  }

  if (sub === "remove") {
    const id = interaction.options.getString("id", true).trim();
    const event = eventsStore.items[id];
    if (!event) {
      return {
        embeds: [new EmbedBuilder().setTitle(`Event not found: ${id}`).setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      };
    }
    delete eventsStore.items[id];
    saveData(data);
    await syncEventsBoard(interaction, data);
    return {
      embeds: [new EmbedBuilder().setTitle(`Event removed: ${event.name}`).setColor(0xef4444)]
    };
  }

  if (sub === "list") {
    const monthSelection = resolveMonthSelection(interaction);
    const events = getEventsForMonth(data, monthSelection.monthKey);
    return { embeds: [buildEventsListEmbed(events, monthSelection.label)], flags: MessageFlags.Ephemeral };
  }

  if (sub === "publish") {
    const result = await syncEventsBoard(interaction, data);
    if (!result.ok) {
      return {
        embeds: [new EmbedBuilder().setTitle(result.error).setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      };
    }
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("Events board updated")
          .setDescription(`Message ID: \`${result.messageId}\``)
          .setColor(0x22c55e)
      ],
      flags: MessageFlags.Ephemeral
    };
  }

  return {
    embeds: [new EmbedBuilder().setTitle("Unknown /events command.").setColor(0xef4444)],
    flags: MessageFlags.Ephemeral
  };
}

function handleResetCommand() {
  const result = resetData();
  if (!result.ok) {
    return { ok: false, message: "Failed to reset data. No changes were applied." };
  }
  return { ok: true, message: "All bot data has been reset to its initial state." };
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

  if (command.root === "reset") {
    const result = handleResetCommand();
    return result.message;
  }

  return "Unknown command.";
}

async function handleSlashCommand(interaction) {
  const data = loadData();
  const commandName = interaction.commandName;

  if (commandName === "setup") {
    if (!interaction.inGuild() || !interaction.guildId) {
      return {
        embeds: [new EmbedBuilder().setTitle("`/setup` can only be used in a server.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      };
    }

    const hasPermission = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild);
    if (!hasPermission) {
      return {
        embeds: [
          new EmbedBuilder()
            .setTitle("You need `Manage Server` permission to run `/setup`.")
            .setColor(0xef4444)
        ],
        flags: MessageFlags.Ephemeral
      };
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "channels") {
      const eventsCommandChannel = interaction.options.getChannel("events_command_channel", true);
      const eventsPublishChannel = interaction.options.getChannel("events_publish_channel", true);
      const guildSettings = getGuildSettings(data, interaction.guildId);
      guildSettings.eventsCommandChannelId = eventsCommandChannel.id;
      guildSettings.eventsPublishChannelId = eventsPublishChannel.id;
      saveData(data);

      return {
        embeds: [
          new EmbedBuilder()
            .setTitle("Channel setup saved")
            .setDescription(
              [
                `Events command channel: <#${eventsCommandChannel.id}>`,
                `Events publish channel: <#${eventsPublishChannel.id}>`
              ].join("\n")
            )
            .setColor(0x22c55e)
        ],
        flags: MessageFlags.Ephemeral
      };
    }
  }

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

  if (commandName === "scores") {
    const sub = interaction.options.getSubcommand();
    if (sub === "add" || sub === "remove") {
      const embed = buildScoresMenuEmbed();
      const components = buildScoresMenuComponents(data);
      return { embeds: [embed], components };
    }
  }

  if (commandName === "points") {
    return { embeds: [buildPointsEmbed(data)] };
  }

  if (commandName === "events") {
    return await handleEventsCommand(interaction, data);
  }

  if (commandName === "reset") {
    const result = handleResetCommand();
    if (!result.ok) {
      return {
        embeds: [new EmbedBuilder().setTitle(result.message).setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      };
    }

    return {
      embeds: [new EmbedBuilder().setTitle(result.message).setColor(0x22c55e)]
    };
  }

  return { embeds: [new EmbedBuilder().setTitle("Unknown command.").setColor(0xef4444)] };
}

async function handleComponentInteraction(interaction) {
  const data = loadData();
  const [scope, action, key, extra] = interaction.customId.split(":");

  if (scope === "scores") {
    const teamKey = decodeKey(key);
    const sessionId = interaction.message?.id;
    if (!sessionId) return;

    if (action === "select") {
      const team = data.teams[teamKey];
      if (!team) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const session = { teamKey, points: null, playerKey: "__team__" };
      scoreSessions.set(sessionId, session);
      await interaction.update({
        embeds: [buildScoresAddEmbed(team, session, data)],
        components: buildScoresAddComponents(team, session, sessionId, data)
      });
      return;
    }

    if (action === "playerSelect") {
      const session = scoreSessions.get(sessionId);
      if (!session) return;
      session.playerKey = interaction.values[0];
      const team = data.teams[session.teamKey];
      await interaction.update({
        embeds: [buildScoresAddEmbed(team, session, data)],
        components: buildScoresAddComponents(team, session, sessionId, data)
      });
      return;
    }

    if (action === "pointsModal") {
      const team = data.teams[teamKey];
      if (!team) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle("Team not found.").setColor(0xef4444)],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`scores:pointsModal:${teamKey}:${extra}`)
        .setTitle("Add how many points?");
      const input = new TextInputBuilder()
        .setCustomId("points")
        .setLabel("Add how many points?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("Use negative to remove");
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (action === "confirm") {
      const session = scoreSessions.get(sessionId);
      if (!session || session.points == null) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle("Set point value first.").setColor(0xef4444)],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const team = data.teams[session.teamKey];
      if (!team) return;
      const amount = session.points;
      const player = session.playerKey && session.playerKey != "__team__" ? data.players[session.playerKey] : null;
      team.points = (team.points ?? 0) + amount;
      if (player) {
        player.points = (player.points ?? 0) + amount;
      }
      saveData(data);
      scoreSessions.delete(sessionId);
      const verb = amount >= 0 ? "Added" : "Removed";
      const description = player
        ? `${verb} ${Math.abs(amount)} pts for ${player.tag} (${team.name}).`
        : `${verb} ${Math.abs(amount)} pts for ${team.name}.`;
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("Points recorded")
            .setDescription(description)
            .setColor(0x22c55e)
        ],
        components: []
      });
      return;
    }

    if (action === "cancel") {
      scoreSessions.delete(sessionId);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("Cancelled")
            .setDescription("Point assignment cancelled.")
            .setColor(0x94a3b8)
        ],
        components: []
      });
      return;
    }
  }

  if (scope === "eventsAdd" && action === "regionSelect") {
    const session = eventAddSessions.get(key);
    if (!session || !session.pendingDraft) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Event draft expired. Run /events add again.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const regionKey = normalizeRegionInput(interaction.values?.[0] ?? "");
    if (!regionKey) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Invalid region selection.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const eventsStore = ensureEventsStore(data);
    const id = createEventId();
    const event = {
      id,
      name: session.pendingDraft.name,
      date: session.pendingDraft.date,
      region: regionKey,
      address: session.pendingDraft.address,
      registerUrl: session.pendingDraft.registerUrl,
      notes: ""
    };
    eventsStore.items[id] = event;
    saveData(data);

    const syncResult = await syncEventsBoard(interaction, data);
    eventAddSessions.delete(key);
    if (!syncResult.ok) {
      await interaction.update({
        embeds: [new EmbedBuilder().setTitle(syncResult.error).setColor(0xef4444)],
        components: []
      });
      return;
    }

    const infoLines = [
      `ID: \`${id}\``,
      session.importStatus || "Manual entry saved.",
      "If you haven't created a start.gg page yet, consider doing so so event details can be imported automatically."
    ];
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Event added: ${event.name}`)
          .setDescription(infoLines.join("\n"))
          .setColor(0x22c55e),
        buildEventEmbed(event, data)
      ],
      components: []
    });
    return;
  }

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
    const messagePayload = { ...payload, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(messagePayload);
    }
    return interaction.reply(messagePayload);
  };

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

  if (scope === "events" && action === "addModal") {
    const session = eventAddSessions.get(key);
    if (!session) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Event form expired. Run /events add again.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const manual = {
      name: interaction.fields.getTextInputValue("name").trim(),
      date: interaction.fields.getTextInputValue("date").trim(),
      address: interaction.fields.getTextInputValue("address").trim(),
      registerUrl: interaction.fields.getTextInputValue("registerUrl").trim()
    };

    let imported = session.imported ?? null;
    let importStatus = session.importStatus ?? "";
    const needsImport = Boolean(
      session.startGgUrl &&
        (!manual.name || !manual.date || !manual.address || !manual.registerUrl)
    );

    if (needsImport && !imported) {
      const result = await importStartGgEvent(session.startGgUrl);
      if (result.ok) {
        imported = result.data;
        importStatus = "Imported available fields from start.gg.";
      } else {
        importStatus = `Could not import from start.gg: ${result.error}`;
      }
    }

    const name = manual.name || imported?.name || "";
    const dateRaw = manual.date || imported?.date || "";
    const address = manual.address || imported?.address || "";
    const registerUrl = manual.registerUrl || imported?.registerUrl || session.startGgUrl || "";

    if (!name || !dateRaw || !address || !registerUrl) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing required fields.")
            .setDescription(
              "Provide name, date, where (address), and register URL. start.gg import can fill missing values when available."
            )
            .setColor(0xef4444)
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const date = parseIsoDate(dateRaw);
    if (!date) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Date must use YYYY-MM-DD format.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!validateRegisterReference(registerUrl)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Register must be a URL or start.gg slug.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    session.pendingDraft = {
      name,
      date,
      address,
      registerUrl: normalizeRegisterReference(registerUrl)
    };
    session.imported = imported;
    session.importStatus = importStatus;
    eventAddSessions.set(key, session);
    await interaction.reply({
      embeds: [buildRegionSelectionEmbed()],
      components: buildRegionSelectionComponents(key),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (scope === "scores" && action === "pointsModal") {
    const sessionId = parts[3];
    const session = scoreSessions.get(sessionId);
    if (!session) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Session expired.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const amountRaw = interaction.fields.getTextInputValue("points").trim();
    const amount = Number.parseInt(amountRaw, 10);
    if (!Number.isFinite(amount)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Amount must be a whole number.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    session.points = amount;
    const team = data.teams[session.teamKey];
    if (team && interaction.channel) {
      try {
        const message = await interaction.channel.messages.fetch(sessionId);
        await message.edit({
          embeds: [buildScoresAddEmbed(team, session, data)],
          components: buildScoresAddComponents(team, session, sessionId, data)
        });
      } catch (err) {
        console.error("Failed to update points message:", err);
      }
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Points recorded (pending confirmation).").setColor(0x22c55e)],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (scope === "player" && action === "renameModal") {
    const player = data.players[key];
    if (!player) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Player not found.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const nextName = interaction.fields.getTextInputValue("name").trim();
    if (!nextName) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Name cannot be empty.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const result = renamePlayer(data, player.tag, nextName);
    if (!result.ok) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle(result.error).setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const nextName = interaction.fields.getTextInputValue("name").trim();
    if (!nextName) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Name cannot be empty.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const result = renameTeam(data, team.name, nextName);
    if (!result.ok) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle(result.error).setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const amountRaw = interaction.fields.getTextInputValue("amount").trim();
    const amount = Number.parseInt(amountRaw, 10);
    if (!Number.isFinite(amount)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Amount must be a whole number.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
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

  client.on("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.type === InteractionType.ModalSubmit) {
      try {
        await handleModalSubmit(interaction);
      } catch (err) {
        console.error("Failed to handle modal interaction:", err);
        await safeReplyInteraction(interaction, {
          embeds: [new EmbedBuilder().setTitle("Something went wrong.").setColor(0xef4444)],
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      try {
        await handleComponentInteraction(interaction);
      } catch (err) {
        console.error("Failed to handle component interaction:", err);
        const details = err?.message ? `\n${err.message}` : "";
        await safeReplyInteraction(interaction, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Something went wrong handling that action.")
              .setDescription(`Action: ${interaction.customId}${details}`)
              .setColor(0xef4444)
          ],
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
      const response = await handleSlashCommand(interaction);
      if (response) {
        await safeReplyInteraction(interaction, response);
      }
    } catch (err) {
      console.error("Failed to handle interaction:", err);
      await safeReplyInteraction(interaction, {
        embeds: [new EmbedBuilder().setTitle("Something went wrong.").setColor(0xef4444)],
        flags: MessageFlags.Ephemeral
      });
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
