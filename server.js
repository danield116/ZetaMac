const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
const csvPath = path.join(dataDir, "results.csv");
/** One fixed sequence for all participants; change seed + id if you run a new study version. */
const FIXED_SEQUENCE_SEED = 924852001;
const GLOBAL_POOL_ID = "fixed_v4";
const QUESTIONS_PER_POOL = 80;
const ROUND_SECONDS = 120;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function ensureCsvFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(csvPath)) {
    const header =
      "session_id,participant_id,condition,pool_id,question_index,operation,left_operand,right_operand,correct_answer,user_answer,is_correct,response_time_ms,answer_speed_q_per_s,timestamp\n";
    fs.writeFileSync(csvPath, header, "utf8");
  }
}

function sanitizeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, "\"\"");
  return `"${text}"`;
}

function createSeededRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function buildQuestionFromSpec(op, level, rng) {
  let a;
  let b;
  let answer;

  // ZetaMac-like ranges, but only MEDIUM/HARD.
  // - Addition/Subtraction: use 2-digit operands (10..99) so difficulty is not trivial.
  // - Multiplication: (2..12) * (2..100)
  // - Division: exact integer answers, reverse of multiplication.
  if (op === "+") {
    const wantHard = level === "hard";
    let ok = false;
    for (let t = 0; t < 3000 && !ok; t += 1) {
      const tensA = randomInt(rng, 1, 9);
      const tensB = randomInt(rng, 1, 9);
      const onesA = randomInt(rng, 0, 9);
      const onesB = randomInt(rng, 0, 9);

      // Require ones carry always (keeps medium/hard meaningfully hard).
      if (onesA + onesB < 10) continue;

      const tensSum = tensA + tensB;
      if (wantHard) {
        // Tens carry too.
        if (tensSum < 9) continue;
      } else {
        // Prevent tens carry out.
        if (tensSum > 8) continue;
      }

      a = tensA * 10 + onesA;
      b = tensB * 10 + onesB;
      ok = true;
    }
    answer = a + b;
  } else if (op === "-") {
    const wantHard = level === "hard";
    let ok = false;
    for (let t = 0; t < 6000 && !ok; t += 1) {
      const x = randomInt(rng, 10, 99);
      const y = randomInt(rng, 10, 99);
      const aa = Math.max(x, y);
      const bb = Math.min(x, y);

      const onesA = aa % 10;
      const onesB = bb % 10;

      // Force a ones-place borrow.
      if (onesA >= onesB) continue;

      const res = aa - bb;
      if (wantHard) {
        if (res > 24) continue; // small outcomes
      } else {
        if (res < 25) continue; // medium outcomes
      }

      a = aa;
      b = bb;
      ok = true;
    }
    answer = a - b;
  } else if (op === "x") {
    // ZetaMac: (2..12) * (2..100).
    // Medium uses smaller second operands; hard uses larger second operands.
    a = randomInt(rng, 2, 12);
    if (level === "hard") {
      b = randomInt(rng, 51, 100);
    } else {
      b = randomInt(rng, 2, 50);
    }
    answer = a * b;
  } else {
    // Division: exact integer answers; reverse of multiplication.
    // b is divisor in 2..12, answer is quotient in 2..100.
    b = randomInt(rng, 2, 12);
    if (level === "hard") {
      answer = randomInt(rng, 51, 100);
    } else {
      answer = randomInt(rng, 2, 50);
    }
    a = b * answer; // dividend
  }

  return { a, b, op, answer, level };
}

/** Per operation difficulty sequence: medium, medium, hard, hard repeated 5x (20 items total). */
function levelsPerOperation() {
  const block = ["medium", "medium", "hard", "hard"];
  return [...block, ...block, ...block, ...block, ...block];
}

/**
 * One question list for the whole study: round-robin by operation so no long runs of one op.
 * Order is always +, -, x, /, +, -, x, /, … (20 of each across 80 items).
 * Difficulty alternates medium/hard so hard items are reached regularly even if
 * participants do not finish the full 80-question list.
 */
function generateGlobalFixedSequence() {
  const rng = createSeededRng(FIXED_SEQUENCE_SEED);
  const ops = ["+", "-", "x", "/"];
  const perOp = {};
  for (const op of ops) {
    perOp[op] = levelsPerOperation().map((level) => buildQuestionFromSpec(op, level, rng));
  }
  const questions = [];
  for (let i = 0; i < QUESTIONS_PER_POOL; i += 1) {
    const op = ops[i % 4];
    const round = Math.floor(i / 4);
    questions.push(perOp[op][round]);
  }
  return questions;
}

const GLOBAL_QUESTION_SEQUENCE = generateGlobalFixedSequence();

app.get("/api/session-config", (req, res) => {
  const requestedCondition = String(req.query.condition || "").toLowerCase();
  const condition = requestedCondition === "loss" ? "loss" : "gain";

  res.json({
    condition,
    poolId: GLOBAL_POOL_ID,
    roundSeconds: ROUND_SECONDS,
    questionsPerPool: QUESTIONS_PER_POOL,
    questions: GLOBAL_QUESTION_SEQUENCE,
  });
});

app.post("/api/log", (req, res) => {
  ensureCsvFile();

  const {
    sessionId,
    participantId,
    condition,
    poolId,
    questionIndex,
    operation,
    leftOperand,
    rightOperand,
    correctAnswer,
    userAnswer,
    isCorrect,
    reactionTimeMs,
    timestamp,
  } = req.body || {};

  const correctFlag =
    isCorrect === true || isCorrect === 1 || String(isCorrect).toLowerCase() === "true" ? 1 : 0;

  const rt = Number(reactionTimeMs);

  const rowValues = [
    sessionId,
    participantId,
    condition,
    poolId,
    questionIndex,
    operation,
    leftOperand,
    rightOperand,
    correctAnswer,
    userAnswer,
    correctFlag,
    Number.isFinite(rt) ? Math.round(rt) : "",
    rt > 0 ? (1000 / rt).toFixed(4) : "",
    timestamp || new Date().toISOString(),
  ];

  const row = `${rowValues.map(sanitizeCsvValue).join(",")}\n`;
  fs.appendFileSync(csvPath, row, "utf8");

  res.json({ ok: true });
});

app.get("/api/results.csv", (req, res) => {
  ensureCsvFile();
  res.sendFile(csvPath);
});

app.listen(PORT, () => {
  ensureCsvFile();
  console.log(`Server running on http://localhost:${PORT}`);
});
