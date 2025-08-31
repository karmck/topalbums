import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load .env only if it exists (local development)
try {
  import('dotenv').then(dotenv => dotenv.config());
} catch (e) {
  // dotenv not needed on GitHub Actions
}

// Read credentials from environment variables
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing Spotify credentials in environment variables");
  process.exit(1);
}

const ALBUMS_FOLDER = "albums";
const JSON_FOLDER = path.join("docs", "json");

if (!fs.existsSync(JSON_FOLDER)) fs.mkdirSync(JSON_FOLDER);

// ---------------- Spotify Auth ----------------
async function getAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Failed to get Spotify access token");
  return (await res.json()).access_token;
}

// ---------------- Spotify Search ----------------
async function searchAlbum(token, query) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    query
  )}&type=album&limit=1`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.albums.items.length) return null;

  const album = data.albums.items[0];
  return {
    name: album.name,
    artist: album.artists.map((a) => a.name).join(", "),
    cover: album.images?.[0]?.url || "",
    url: album.external_urls.spotify,
  };
}

// ---------------- Main ----------------
async function generateYearJson(year) {
  const filePath = path.join(ALBUMS_FOLDER, `${year}.txt`);
  if (!fs.existsSync(filePath)) {
    console.error(`No file for year ${year}`);
    return;
  }

  const albumsList = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const token = await getAccessToken();
  const albums = [];

  for (const entry of albumsList) {
    try {
      const album = await searchAlbum(token, entry);
      if (album) {
        albums.push(album);
        console.log(`✅ Found: ${entry}`);
      } else {
        console.log(`❌ Skipped (not found): ${entry}`);
      }
    } catch (err) {
      console.error(`Error fetching ${entry}:`, err);
    }
  }

  fs.writeFileSync(path.join(JSON_FOLDER, `${year}.json`), JSON.stringify(albums, null, 2));
  console.log(`\n✨ Generated json/${year}.json with ${albums.length} albums`);
}

// Run with node generate-year-json.js 2025
const year = process.argv[2];
if (!year) {
  console.error("Usage: node generate-year-json.js <year>");
  process.exit(1);
}
generateYearJson(year);
