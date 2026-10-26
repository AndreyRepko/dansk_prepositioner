# Danske præpositioner – quiz

Angular app for drilling Danish fixed expressions with prepositions (PD3 level).
Each question is a sentence with a gap and 4 options; after answering you see the
explanation and the Ukrainian translation.

## Run

```bash
npm install
npm start          # http://localhost:4200, progress kept in this browser (no backend needed)
npm test           # unit tests (Vitest)
npm run build      # output: dist/dansk-prepositioner/browser (uses the API for progress)
```

Keyboard: `1`–`4` answers, `Enter` goes to the next question.

### With the API locally

Needs [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4.
Create `api/local.settings.json` (git-ignored):

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "TABLES_CONNECTION_STRING": "UseDevelopmentStorage=true"
  }
}
```

```bash
npx -p azurite@3 azurite-table --location .azurite   # storage emulator (port 10002)
cd api && npm install && npm run build && npm start  # functions on :7071
npm run start:api                                    # app on :4200, /api proxied to :7071
cd api && npm test                                   # API unit tests
```

## Sharing

**Share** in the header opens a dialog with a QR code (scan it from a phone to open the app),
**Copy link**, and **Share…** (the device's share sheet, shown only where the browser supports it).
It always shares the production URL in `src/app/share/share-url.ts`, never the current page, so links
shared from a PR preview still work. The link does not carry progress: each person picks their own name.

`public/qr.svg` encodes that URL. If the URL changes, regenerate it:

```bash
npx qrcode@1.5.4 -t svg -o public/qr.svg "<APP_URL>"
```

## Data

`data/praepositioner.json` is the source the app loads (`data/praepositioner.csv` has the same
content for spreadsheets). Each item in `udtryk` has:

| field          | meaning                                         |
| -------------- | ----------------------------------------------- |
| `saetning`     | sentence with exactly one gap `___`             |
| `praeposition` | correct answer                                  |
| `forkerte`     | three wrong options                             |
| `forklaring`   | short rule shown after answering                |
| `ukrainsk`     | translation                                     |
| `kategori`     | used by the category filter                     |
| `mine_fejl`    | my own mistakes – asked first among new items   |

To add an expression, append an item with a new `id`.

## How questions are chosen (spaced repetition)

Every expression sits in a Leitner box (`src/app/services/srs.ts`):

| box | meaning          | due again after |
| --- | ---------------- | --------------- |
| 0   | new              | –               |
| 1   | recent mistake   | immediately     |
| 2   | known once       | 1 day           |
| 3   |                  | 3 days          |
| 4   | mastered         | 7 days          |
| 5   | mastered         | 21 days         |

A correct answer on a due item moves it one box up (at least to box 2); answering a not-yet-due
item correctly changes nothing, so repeating sessions cannot fast-track it. A wrong answer
always sends the item back to box 1. A session (10 questions by default) is filled with: recent mistakes → other due
items → new items (`mine_fejl` first) → least recently seen items. Within a session a wrong
answer is asked again at the end until it is answered correctly (only the first attempt
counts for the statistics).

## Names and storage

There is no login. On the first visit the app asks for a name (`/who`); the browser remembers it
and the names used before, and the header has a *switch* link. Progress belongs to the name, so
the same name on another device shows the same progress. Names are case-insensitive, 1–30
letters/digits/spaces/`. _ ' -`. Anyone who types the same name shares that progress, and when
one name is used on two devices at once the last save wins. Progress is reloaded when the tab
becomes visible again (outside a running session), so a tab left open picks up practice done elsewhere.

Storage goes through `ProgressStore` (chosen in `app.config.ts` by the `USE_API` build define):

- **Production** (`ApiProgressStore`): `GET/PUT /api/progress/{name}` (Azure Functions in `api/`),
  stored in Azure Table Storage, table `progress`, one row per name (`PartitionKey` = lower-case
  name). The JSON is split over `data0..dataN` properties because a table property holds at most
  64 KiB; the app keeps the last 200 sessions so a row stays small.
- **`npm start`** (`LocalStorageProgressStore`): browser `localStorage`, one key per name.

Progress saved before names existed (one unnamed `localStorage` entry) is moved to the first
name entered in that browser that has no progress yet.

## Deployment (Azure Static Web Apps)

The Static Web App `swa-dansk-prep` (Free plan, resource group `rg_dansk_prep`) deploys via
`.github/workflows/azure-static-web-apps-*.yml`: on every push to `main` it tests and builds the
app (Node 24) and the API (Node 22, the managed Functions runtime set in
`public/staticwebapp.config.json`) and uploads both; pull requests get a preview environment
(it shares the same table). `staticwebapp.config.json` also rewrites deep links (`/stats`,
`/quiz`) to `index.html`.

The API reads the app setting `TABLES_CONNECTION_STRING` (connection string of the storage
account `sadanskprep`); it creates the table on first use.
