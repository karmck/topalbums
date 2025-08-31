import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.resolve();
const albumsFile = path.join(__dirname, "albums.json");
const outputDir = path.join(__dirname, "docs", "images");
const htmlFile = path.join(__dirname, "docs", "index.html");

// Ensure output dir exists
fs.mkdirSync(outputDir, { recursive: true });

// Load albums.json
const albums = JSON.parse(fs.readFileSync(albumsFile, "utf-8"));

// Spotify Auth
async function getSpotifyToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  return data.access_token;
}

async function fetchAlbumCover(title, artist, token) {
  const query = encodeURIComponent(`${title} ${artist}`);
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${query}&type=album&limit=1`,
    {
      headers: { Authorization: "Bearer " + token },
    }
  );

  const data = await res.json();
  if (data.albums && data.albums.items.length > 0) {
    const album = data.albums.items[0];
    return {
      imageUrl: album.images[0]?.url || null,
      spotifyUrl: album.external_urls.spotify,
    };
  }
  return { imageUrl: null, spotifyUrl: null };
}

async function downloadImage(url, filepath) {
  const res = await fetch(url);
  const buffer = await res.buffer();
  fs.writeFileSync(filepath, buffer);
}

async function main() {
  const token = await getSpotifyToken();

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>My Favorite Albums</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    h2 { margin-top: 40px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 20px; }
    .album { text-align: center; }
    .album img { max-width: 100%; border-radius: 8px; }
    .album a { text-decoration: none; color: inherit; }
  </style>
</head>
<body>
  <h1>My Favorite Albums by Year</h1>
`;

  for (const year of Object.keys(albums)) {
    html += `<h2>${year}</h2><div class="grid">`;

    for (const album of albums[year]) {
      const safeTitle = (album.title || "unknown").replace(/[^\w\d]/g, "_");
      const safeArtist = (album.artist || "unknown").replace(/[^\w\d]/g, "_");
      const fileName = `${safeArtist}-${safeTitle}.jpg`;
      const filePath = path.join(outputDir, fileName);

      if (!fs.existsSync(filePath)) {
        const { imageUrl, spotifyUrl } = await fetchAlbumCover(
          album.title,
          album.artist,
          token
        );
        if (!imageUrl || !spotifyUrl) {
          console.warn(
            `⚠️ Skipping: ${album.title} by ${album.artist} (no Spotify match)`
          );
          continue;
        }
        await downloadImage(imageUrl, filePath);
        album.spotifyUrl = spotifyUrl;
      }

      html += `<div class="album">
        <a href="${album.spotifyUrl}" target="_blank">
          <img src="images/${fileName}" alt="${album.title}">
        </a>
        <div>${album.title}<br><em>${album.artist}</em></div>
      </div>`;
    }

    html += `</div>`;
  }

  html += `
</body>
</html>`;

  fs.writeFileSync(htmlFile, html, "utf-8");
  console.log("✅ Album page generated at docs/index.html");
}

main();
