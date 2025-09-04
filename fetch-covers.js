import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { google } from "googleapis";
import dotenv from "dotenv";

// Load .env if exists (local dev)
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Spotify credentials
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing Spotify credentials in environment variables");
  process.exit(1);
}

// Google Sheets service account key
const KEYFILEPATH = path.resolve(process.cwd(), "topalbums-service-account.json");
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const JSON_FOLDER = path.join("docs", "json");
if (!fs.existsSync(JSON_FOLDER)) fs.mkdirSync(JSON_FOLDER);

// ---------------- Spotify Auth ----------------
async function getAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Failed to get Spotify access token");
  return (await res.json()).access_token;
}

// ---------------- Spotify Search ----------------
async function searchAlbum(token, query, year) {
  // Spotify search query with year filter
  const searchQuery = `${query} year:${year}`;

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    searchQuery
  )}&type=album&limit=10`; // fetch more results to prioritize

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.albums.items.length) return null;

  // Prefer album or ep over single
  const preferred = data.albums.items.find(
    (a) => a.album_type === "album" || a.album_type === "ep"
  ) || data.albums.items[0]; // fallback to first if none match

  return {
    name: preferred.name,
    artist: preferred.artists.map((a) => a.name).join(", "),
    cover: preferred.images?.[0]?.url || "",
    url: preferred.external_urls.spotify,
  };
}



// ---------------- Google Sheets ----------------
async function getSheetAlbums(year) {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: year, // tab named as the year
    });
    return res.data.values?.flat().filter(Boolean) || [];
  } catch (err) {
    console.error(`Failed to fetch sheet for year ${year}:`, err);
    return [];
  }
}

// ---------------- Main ----------------
async function generateYearJson(year) {
  const albumsList = await getSheetAlbums(year);
  if (!albumsList.length) {
    console.log(`No data found for year ${year}`);
    return;
  }

  const token = await getAccessToken();
  const albums = [];

  for (const entry of albumsList) {
    try {
      const album = await searchAlbum(token, entry, year); // pass the year here
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

  // Update lastupdated.txt
  const now = new Date();
  const formatted = now
    .toLocaleString("en-GB", { hour12: false }) // dd/mm/yyyy, HH:MM:SS
    .replace(",", ""); // remove the comma from locale string

  fs.writeFileSync(path.join(process.cwd(), "docs/lastupdated.txt"), formatted);
  console.log(`📝 Updated lastupdated.txt -> ${formatted}`);

}

// Run: node fetch-covers.js 2025
const year = process.argv[2];
if (!year) {
  console.error("Usage: node fetch-covers.js <year>");
  process.exit(1);
}

generateYearJson(year);
