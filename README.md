# ZetaMac

Gain/loss framed feedback for a ZetaMac-like arithmetic web application.

## Features

- Timed arithmetic task (**120 s / 2 min** by default) with ZetaMac-style layout. Question list is longer than most people will finish on purpose (ceiling / upper bound).
- Four operations: addition, subtraction, multiplication, division.
- Division questions are always exactly divisible (integer answers).
- Participants complete one condition only, selected at dashboard start (`gain` or `loss`).
- **One fixed question sequence** for every participant (same items, same order):
  - **80 questions** total: **20** of each operation (add, subtract, multiply, divide)
  - **Round-robin order** (`+`, `-`, `x`, `/`, `+`, `-`, …) so operations stay evenly spread—no long blocks of a single operation
  - Within each operation, difficulty uses **only medium/hard** in a repeating **2-2** block: `medium, medium, hard, hard` (repeated 5x = 20/op). This guarantees hard items appear regularly even for faster cutoffs.
  - `pool_id` in the CSV is `fixed_v4` (change seed + id in code if you publish a new study version)
  - Round length: **`ROUND_SECONDS` in `server.js` / `public/script.js`** (default **120**). Increase if you want even more exposure to harder items; decrease only if you need a shorter protocol.
- Two conditions:
  - `gain`: points accumulation bar (starts at `0`, increases on correct answers)
  - `loss`: points deaccumulation bar (starts at `25`, decreases on wrong answers, floor at `0`)
- CSV logging per attempt.
- Participant ID is **generated automatically** for each round (no manual entry). Each ID is a **UUID** (`P-…`), so it is effectively unique even if someone else hosts the app on their own computer—you will not get ID “collisions” when merging CSV files from different machines.

## Data Logging

CSV is recorded at `data/results.csv` with columns:

If you change column layout and already have an old `results.csv`, **delete or rename it once** so a new file gets the correct header.

- `session_id`
- `participant_id`
- `condition`
- `pool_id`
- `question_index`
- `operation`
- `left_operand`
- `right_operand`
- `correct_answer`
- `user_answer`
- `is_correct` (`1` = correct, `0` = incorrect)
- `response_time_ms`
- `answer_speed_q_per_s`
- `timestamp`

## Run

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Sharing a link with participants

**GitHub alone** hosts your code, not a running Node server. **GitHub Pages** only serves static files, so it **cannot** run this app’s Express backend (no `/api/log`, no server-side CSV).

Use a free **Node host** and point your study link there:

1. Push this repo to GitHub (as you already do for version control).
2. Deploy the same repo on one of these (all support Node + persistent-ish disk or you download CSV from the admin URL):
   - **[Render](https://render.com)** — Web Service, build `npm install`, start `npm start`, set `PORT` from their env if needed.
   - **[Railway](https://railway.app)** — New project from GitHub repo, start command `npm start`.
   - **[Fly.io](https://fly.io)** — Similar; good for small apps.

After deploy, share the URL they give you (e.g. `https://your-app.onrender.com`). Participants open that link; you collect `data/results.csv` from the server (or add a download link — the app already links to `/api/results.csv` on the same host).

**Tip:** On many free hosts the filesystem is **ephemeral** — if the dyno restarts, the CSV may reset. For a serious study, either use a host with a **persistent disk** add-on or periodically download `/api/results.csv` during collection.
