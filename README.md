# Danske præpositioner – quiz

Angular app for drilling Danish fixed expressions with prepositions (PD3 level).
Each question is a sentence with a gap and 4 options; after answering you see the
explanation and the Ukrainian translation.

## Run

```bash
npm install
npm start          # http://localhost:4200
npm test           # unit tests (Vitest)
npm run build      # output: dist/dansk-prepositioner/browser
```

Keyboard: `1`–`4` answers, `Enter` goes to the next question.

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

A correct answer moves the item one box up (at least to box 2); a wrong answer sends it back
to box 1. A session (10 questions by default) is filled with: recent mistakes → other due
items → new items (`mine_fejl` first) → least recently seen items. Within a session a wrong
answer is asked again at the end until it is answered correctly (only the first attempt
counts for the statistics).

## Storage

Progress is kept in the browser's `localStorage` (`LocalStorageProgressStore`). Storage goes
through the `ProgressStore` abstraction, so a backend store can replace it in `app.config.ts`.

## Deployment (Azure Static Web Apps)

Create a Static Web App (Free plan) linked to this repo, preset **Angular**, app location `/`,
output location `dist/dansk-prepositioner/browser`. `public/staticwebapp.config.json` rewrites
deep links (`/stats`, `/quiz`) to `index.html`.

Planned: an `api/` folder with Azure Functions (`GET/PUT /api/progress`) backed by Azure Table
Storage, keyed by the Static Web Apps login, so progress syncs between devices.
