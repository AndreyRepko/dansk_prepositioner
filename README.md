# Danske præpositioner – quiz

Angular app for drilling Danish fixed expressions with prepositions (PD3 level).
Each question is a sentence with a gap and 4 options; after answering you see the
explanation and the Ukrainian translation. Every expression has 6 sentences, asked in turn, so
an expression counts as learnt only when it is recognised in new sentences too.

## Run

```bash
npm install
npm start          # http://localhost:4200, progress kept in this browser (no backend needed)
npm test           # unit tests (Vitest)
npm run build      # output: dist/dansk-prepositioner/browser (uses the API for progress)
```

Keyboard: `1`–`4` answers, `0` is *Ved ikke* (don't know), `Enter` goes to the next question.

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
shared from a PR preview still work. The link does not carry progress: each person practises as guest or signs in with their own name.

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
| `flere_saetninger` | more sentences (`saetning` + its own `forkerte`), same answer |
| `forklaring`   | short rule shown after answering                |
| `ukrainsk`     | translation                                     |
| `engelsk`      | English translation                             |
| `kategori`     | used by the category filter                     |
| `mine_fejl`    | my own mistakes – asked first among new items   |

To add an expression, append an item with a new `id`. Progress refers to sentences by their
position (`saetning` is 0, then `flere_saetninger` in order), so add new sentences at the end
rather than reordering them. The CSV has the extra sentences as columns `saetning2`…`saetning6`
with `forkert2_1`… next to them.

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
always sends the item back to box 1. An item reaches box 4 (mastered) only when at least 3 of its
sentences are known (their latest answer was right); until then it stays in box 3. Items already
in box 4–5 from before sentences were counted keep their box. A session (10 questions by default) is filled with: recent mistakes → other due
items → new items (`mine_fejl` first) → least recently seen items. Within a session a wrong
answer is asked again at the end, with the same sentence (or another one, see below), until it is answered correctly (only
the first attempt counts for the statistics).

**Ved ikke** (don't know) counts as a wrong answer: the item goes back to box 1 and is asked again
at the end of the session. It is not counted as a mix-up, and the answer is shown without
"Forkert". It exists so that blind guesses (right 1 time in 4) do not promote items or mark
sentences as known; guessing itself is not harmful when the right answer is shown right away
(Kornell, Hays & Bjork 2009; Butler & Roediger 2008). Statistics show how often it was used.

Each time an expression comes up it is asked with a sentence not answered yet, otherwise with the
one answered longest ago. Per sentence the progress keeps the answer counts, whether the very first
answer on it was right and whether the latest one was; per expression it counts the wrong options
chosen. Answers given before sentences were counted were all on the first sentence, so they count
as answers on it (whether the very first was right is guessed). From that:

- **Tiers**: a mastered expression gets ★ / ★★ / ★★★ when 4 / 5 / all 6 sentences are known.
- **New vs. familiar sentences** (Statistics): accuracy on the first answer to each sentence
  compared with later answers on sentences seen before. More than 15 points better on familiar
  sentences (with at least 10 answers on each side) means
  the sentences are remembered rather than the expression; the expressions where this shows most
  are listed.
- **Common mix-ups** (Statistics): which preposition was chosen instead of which, with examples.

Whether a retry should rather use another sentence is open (studies are mixed), so it is a
setting on Home: *Retry mistakes with another sentence* re-asks with a random other sentence. A
later within-person test could randomly use the same or another sentence per retry and compare
the first answers at the next review.

## Guests, accounts and storage

The app opens straight into practice as a **guest**: progress stays in this browser only. To keep
progress across devices, **sign in** (`/who`, header link) with a name and a password. An unknown
name gets a one-click *Create account* (so a typo in an existing name does not silently make a new
one). On signing in, guest progress is merged into the account (per expression the newer answer sets
the box and due date, counts add up, sessions interleave) and removed from the browser only after the
account has saved it. Each merge is marked (a local copy of what was added, and an id kept in the
account), so a retried or interrupted sign-in adds only guest practice that is new since. Removing
the signed-in name from the list on `/who` signs out. *Sign out* returns to guest mode.

The password only keeps a name from being reused by accident; it is not real security. The browser
sends and remembers `SHA-256(password + lower-case name)` (hex, `X-Password-Hash` header), never the
password; the server stores that hash with the progress and answers 401 when none is sent and 403
for a different one. A name saved before passwords existed is claimed by the first password used with
it (only the hash is written, and only if the row did not change meanwhile; a new name is created
only if it does not exist yet, so two devices cannot both take a name: the loser gets 409). Such names
are still listed on `/who`, and while practising as guest a notice asks to sign in with one of them. Names are case-insensitive, 1–30
letters/digits/spaces/`. _ ' -`. When one account is used on two devices at once the last save wins.
Progress is reloaded when the tab becomes visible again (outside a running session).

Account storage goes through `ProgressStore` (chosen in `app.config.ts` by the `USE_API` build define):

- **Production** (`ApiProgressStore`): `GET/PUT /api/progress/{name}` (Azure Functions in `api/`),
  stored in Azure Table Storage, table `progress`, one row per name (`PartitionKey` = lower-case
  name, `passwordHash` column). The JSON is split over `data0..dataN` properties because a table
  property holds at most 64 KiB; the app keeps the last 200 sessions so a row stays small.
- **`npm start`** (`LocalStorageProgressStore`): browser `localStorage`, one key per name, with the
  same password rules, so signing in can be tried without the API.

Guest progress (`GuestProgressStore`) is the `localStorage` key `dansk-prep-progress-v1`, the same
place progress lived before names existed, so such old progress shows up as guest progress.

## Deployment (Azure Static Web Apps)

The Static Web App `swa-dansk-prep` (Free plan, resource group `rg_dansk_prep`) deploys via
`.github/workflows/azure-static-web-apps-*.yml`: on every push to `main` it tests and builds the
app (Node 24) and the API (Node 22, the managed Functions runtime set in
`public/staticwebapp.config.json`) and uploads both; pull requests get a preview environment
(it shares the same table). `staticwebapp.config.json` also rewrites deep links (`/stats`,
`/quiz`) to `index.html`.

The API reads the app setting `TABLES_CONNECTION_STRING` (connection string of the storage
account `sadanskprep`); it creates the table on first use.
