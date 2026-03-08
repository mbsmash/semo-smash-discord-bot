import dotenv from "dotenv";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !applicationId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID in environment.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("Manage players")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a player")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Player tag").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("manage")
        .setDescription("Show player details")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Player tag").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("assign")
        .setDescription("Assign a player to a team")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Player tag").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("team").setDescription("Target team (optional)")
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List registered players")
    ),
  new SlashCommandBuilder()
    .setName("team")
    .setDescription("Manage teams")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a team")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Team name").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("manage")
        .setDescription("Show team details")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Team name").setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName("teams")
    .setDescription("View teams list"),
  new SlashCommandBuilder()
    .setName("scores")
    .setDescription("Add or remove points")
    .addSubcommand((sub) => sub.setName("add").setDescription("Add points"))
    .addSubcommand((sub) => sub.setName("remove").setDescription("Remove points")),
  new SlashCommandBuilder()
    .setName("points")
    .setDescription("View current scores"),
  new SlashCommandBuilder()
    .setName("events")
    .setDescription("Manage and publish upcoming community events")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Open a modal to add an event")
        .addStringOption((opt) =>
          opt
            .setName("startgg_url")
            .setDescription("Optional start.gg URL or short slug to auto-import details")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit an existing event")
        .addStringOption((opt) => opt.setName("id").setDescription("Event ID").setRequired(true))
        .addStringOption((opt) => opt.setName("name").setDescription("Event name"))
        .addStringOption((opt) => opt.setName("date").setDescription("Date (YYYY-MM-DD)"))
        .addStringOption((opt) =>
          opt
            .setName("region")
            .setDescription("Region for color-coding")
            .addChoices(
              { name: "SEMO", value: "semo" },
              { name: "Rolla", value: "rolla" },
              { name: "St. Louis", value: "stl" },
              { name: "Kansas City", value: "kc" },
              { name: "CoMo", value: "como" },
              { name: "SoIL", value: "soil" },
              { name: "Springfield", value: "springfield" },
              { name: "WKY", value: "wky" },
              { name: "Regional", value: "regional" },
              { name: "Major", value: "major" }
            )
        )
        .addStringOption((opt) => opt.setName("address").setDescription("Street/city/state line"))
        .addStringOption((opt) => opt.setName("register_url").setDescription("Registration URL"))
        .addStringOption((opt) => opt.setName("notes").setDescription("Optional notes"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an event")
        .addStringOption((opt) => opt.setName("id").setDescription("Event ID").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List events for a month")
        .addIntegerOption((opt) =>
          opt.setName("month").setDescription("Month number (1-12)").setMinValue(1).setMaxValue(12)
        )
        .addIntegerOption((opt) =>
          opt.setName("year").setDescription("Year (e.g. 2027)").setMinValue(2000).setMaxValue(2100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("publish")
        .setDescription("Publish or update the monthly events message in this channel")
        .addIntegerOption((opt) =>
          opt.setName("month").setDescription("Month number (1-12)").setMinValue(1).setMaxValue(12)
        )
        .addIntegerOption((opt) =>
          opt.setName("year").setDescription("Year (e.g. 2027)").setMinValue(2000).setMaxValue(2100)
        )
    ),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset all bot data to initial state (dev/debug)")
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

try {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
      body: commands
    });
    console.log(`Registered ${commands.length} guild commands.`);
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body: commands });
    console.log(`Registered ${commands.length} global commands.`);
  }
} catch (err) {
  console.error("Failed to register commands:", err);
  process.exit(1);
}
