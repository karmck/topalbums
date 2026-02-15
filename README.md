# Top Albums (Music Picks)

A tiny static site that lists yearly “top albums” with cover art and links to Spotify. A Node.js script reads album entries from a Google Sheet, looks them up on Spotify, and writes per‑year JSON files into the `docs/json/` folder for the frontend to render.

## How It Works
- **Data source:**
  - Option A (preferred when present): local text file `albums/<year>.txt`, one query per line (e.g., `Artist - Album`).
  - Option B (fallback): a Google Sheet with one tab per year (e.g., `2026`), single column of album search strings.
- **Ingestion script:** `fetch-covers.js`
  - Authenticates to Spotify via Client Credentials.
  - Reads album queries from `albums/<year>.txt` if it exists; otherwise reads the target year’s tab from the Google Sheet using a service account.
  - For each row (album query), performs a Spotify search constrained by that year and selects a preferred result (prioritizes `album`/`ep`, otherwise the first result).
  - Writes `docs/json/<year>.json` as an array of album objects and updates `docs/lastupdated.txt` with a timestamp.
- **Frontend:** `docs/index.html`
  - On load, determines a year range from the current year down to 2010 and renders a navigation strip.
  - Fetches `docs/json/<year>.json` for each year and displays cards with cover art, artist, and album name linking to Spotify.
  - Reads `docs/lastupdated.txt` to display a “Last updated” timestamp, handling both local preview and GitHub Pages hosting paths.

## Repository Structure
- `fetch-covers.js`: Node script to generate per‑year JSON and update timestamp.
- `package.json`: Scripts and dependencies.
- `topalbums-service-account.json`: Google service account key (keep private; not for commit. Store in repo secrets instead).
- `docs/`
  - `index.html`: Static site that renders albums.
  - `lastupdated.txt`: Auto‑updated timestamp from the generator script.
  - `json/`: Per‑year album JSON files (e.g., `2024.json`).
  
Optional:
- `albums/`: Plain‑text per‑year lists (e.g., `albums/2026.txt`) used instead of Sheets if present.

## Requirements
- Node.js 18+ recommended.
- Spotify Developer app (Client ID/Secret).
- Google Cloud service account with access to the target Google Sheet (read‑only is sufficient).



## Environment Variables
Provide these via a `.env` file in the project root or your shell environment:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
GOOGLE_SHEET_ID=your_google_sheet_id
```

Also place your Google service account key at the project root as `topalbums-service-account.json`.

## Google Sheets Setup
- Create a Google Sheet with one tab per year (e.g., `2026`).
- In each year tab, list album search strings—ideally `Artist - Album`—one per row in the first column.
- Share the sheet with your service account’s email so it can read it.
- Copy the Sheet ID (the value in the URL between `/d/` and `/edit`). Use this for `GOOGLE_SHEET_ID`.

## Local Text Lists (optional)
If you prefer not to use Google Sheets, create `albums/<year>.txt` with one album query per line (e.g., `Artist - Album`). When this file exists, the generator uses it and does not call the Sheets API for that year.

## Generating Data
Run the script for a specific year. It will read that year’s tab, query Spotify, and write the output JSON and timestamp.

```
node fetch-covers.js 2026
```

Notes:
- The script exits if Spotify credentials are missing.
- If the sheet or tab is missing/inaccessible, the year will be skipped with a logged error.
- The script prefers Spotify results with `album`/`ep` type; otherwise it uses the first result. Covers can be blank if Spotify does not return images.

## Output File Format
Each `docs/json/<year>.json` is an array of album objects with this shape:

```json
[
  {
    "name": "Album Title",
    "artist": "Artist Name",
    "cover": "https://i.scdn.co/image/...",  
    "url": "https://open.spotify.com/album/..."
  }
]
```

The timestamp file `docs/lastupdated.txt` is a single‑line string in `en-GB` format, e.g.:

```
22/01/2026 15:50:49
```

## Preview Locally
Install deps and serve the static site from `docs/`:

```
npm install
npm run serve
```

Then open http://localhost:3000.

## Hosting
- The site is static; you can host the `docs/` folder on GitHub Pages.
- `index.html` includes logic to load `lastupdated.txt` correctly on GitHub Pages when published under a repository path (e.g., `/topalbums/`).

## CI (GitHub Actions)
When running in GitHub Actions, create the Google service account key file from a repository secret before invoking the generator. Example step (from the workflow):

```yaml
# Generate the service-account file from the repo secret
- name: Setup Google Service Account
  run: |
    echo '${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}' > topalbums-service-account.json
```

Then run the generator with your year(s) and environment variables sourced from secrets:

```yaml
- name: Generate JSON
  env:
    SPOTIFY_CLIENT_ID: ${{ secrets.SPOTIFY_CLIENT_ID }}
    SPOTIFY_CLIENT_SECRET: ${{ secrets.SPOTIFY_CLIENT_SECRET }}
    GOOGLE_SHEET_ID: ${{ secrets.GOOGLE_SHEET_ID }}
  run: |
    node fetch-covers.js 2026

If you commit `albums/<year>.txt` files, the workflow can also detect changed years from that folder (see the `paths: "albums/*.txt"` trigger) and the script will use those local lists instead of Sheets for those years.
```
## The Service Account JSON 
This file is NOT generated by Google Sheets. It is created in Google Cloud Console when you generate a key for a Service Account:
- Create/select a GCP project and enable the “Google Sheets API”.
- IAM & Admin → Service Accounts → Create Service Account.
- Add Key → Create new key → JSON → Download. Save this as `topalbums-service-account.json` at the repo root (or inject via CI).
- Share your Google Sheet with the service account’s email (e.g., `name@project-id.iam.gserviceaccount.com`) so it can read the sheet.

Optional alternatives:

Base64-encode the JSON in a secret and base64 -d it in CI.
Change the script to read credentials from an env var and use google.auth.fromJSON(...) if you prefer not to write a file.

## Customization
- **Year range:** The frontend currently renders from the current year down to 2010. To change this, edit the range generation in `docs/index.html`.
- **Album matching:** Adjust the Spotify search limit, filters, or selection logic in `searchAlbum()` inside `fetch-covers.js` if you want stricter/looser matching.

## Troubleshooting
- **Missing credentials:** Ensure `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `GOOGLE_SHEET_ID` are set. The script will exit early if Spotify creds are missing.
- **Sheet access errors (403/404):** Confirm the service account email has access and the tab name matches the year you pass to the script.
- **Empty images:** Some Spotify items may lack images; the script writes an empty string for `cover` in that case.
- **Rate limits:** Heavy use may trigger Spotify rate limiting. Re‑run later or lower the search volume.

## Scripts
From `package.json`:

- `serve`: Preview the static site locally.
- `start`: Invokes `node fetch-covers.js` without arguments (will show usage). Prefer running `node fetch-covers.js <year>` directly.

## Security
- Do not commit `topalbums-service-account.json` or your `.env` file.
- Rotate credentials if they leak and restrict your Google service account to the minimum scopes needed (read‑only Sheets).
