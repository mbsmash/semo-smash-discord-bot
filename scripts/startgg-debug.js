#!/usr/bin/env node
import dotenv from "dotenv";

dotenv.config();

const token = process.env.START_GG_API_TOKEN;
const slugArg = process.argv[2];

if (!token) {
  console.error("Missing START_GG_API_TOKEN in .env");
  process.exit(1);
}

if (!slugArg) {
  console.error("Usage: node scripts/startgg-debug.js <tournament-slug-or-url>");
  console.error("Example: node scripts/startgg-debug.js kachow-kup");
  process.exit(1);
}

function parseTournamentSlug(input) {
  const value = input.trim();

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("tournament");
      if (idx === -1 || !parts[idx + 1]) return null;
      return parts[idx + 1];
    } catch {
      return null;
    }
  }

  return value.replace(/^tournament\//i, "").replace(/^\/+/, "");
}

const tournamentSlug = parseTournamentSlug(slugArg);
if (!tournamentSlug) {
  console.error("Could not parse tournament slug from input.");
  process.exit(1);
}

const query = `
  query TournamentDebug($slug: String!) {
    tournament(slug: $slug) {
      id
      name
      slug
      startAt
      venueAddress
      city
      addrState
      countryCode
      events {
        id
        name
        slug
        startAt
      }
    }
  }
`;

function fmtDate(unixSeconds) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "(unknown)";
  return new Date(unixSeconds * 1000).toISOString();
}

async function fetchTournamentBySlug(slug) {
  const response = await fetch("https://api.start.gg/gql/alpha", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables: { slug } })
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: `HTTP ${response.status} ${response.statusText}\n${body}` };
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    const messages = payload.errors.map((err) => err.message).join("\n");
    return { ok: false, error: `GraphQL errors:\n${messages}` };
  }

  return { ok: true, tournament: payload?.data?.tournament ?? null };
}

async function run() {
  const candidateSlugs = [
    `tournament/${tournamentSlug}`,
    tournamentSlug
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  let t = null;
  let lastError = "";
  let usedSlug = "";

  for (const candidate of candidateSlugs) {
    const result = await fetchTournamentBySlug(candidate);
    if (!result.ok) {
      lastError = result.error;
      continue;
    }
    if (result.tournament) {
      t = result.tournament;
      usedSlug = candidate;
      break;
    }
  }

  if (!t) {
    console.error(`No tournament found for input: ${slugArg}`);
    console.error(`Tried slugs: ${candidateSlugs.join(", ")}`);
    if (lastError) {
      console.error("\nLast API error:");
      console.error(lastError);
    }
    process.exit(1);
  }

  console.log("Tournament:");
  console.log(`- Lookup slug used: ${usedSlug}`);
  console.log(`- ID: ${t.id}`);
  console.log(`- Name: ${t.name}`);
  console.log(`- Slug: ${t.slug}`);
  console.log(`- Start: ${fmtDate(t.startAt)}`);
  console.log(`- Location: ${[t.venueAddress, t.city, t.addrState, t.countryCode].filter(Boolean).join(", ") || "(unknown)"}`);

  const events = Array.isArray(t.events) ? t.events : [];
  console.log(`- Events returned: ${events.length}`);

  if (events.length) {
    console.log("\nSample Events:");
    events.forEach((event, idx) => {
      console.log(`${idx + 1}. ${event.name}`);
      console.log(`   id: ${event.id}`);
      console.log(`   slug: ${event.slug}`);
      console.log(`   start: ${fmtDate(event.startAt)}`);
    });
  }
}

run().catch((err) => {
  console.error("Request failed:", err?.message ?? err);
  process.exit(1);
});
