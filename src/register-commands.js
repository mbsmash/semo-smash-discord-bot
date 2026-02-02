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
    ),
  new SlashCommandBuilder()
    .setName("teams")
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
    .setName("team")
    .setDescription("Team alias")
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
    )
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
