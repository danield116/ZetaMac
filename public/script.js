const ROUND_SECONDS = 120;
const LOSS_START = 25;
/** Gain bar matches score (+1 per correct). Loss bar still -1 per wrong. */
const BAR_STEP_CORRECT = 1;
const BAR_STEP_WRONG = 1;
/** Must match server.js FIXED_SEQUENCE_SEED / GLOBAL_POOL_ID for identical fallback. */
const FIXED_SEQUENCE_SEED = 924852001;
const GLOBAL_POOL_ID = "fixed_v4";
const QUESTIONS_PER_POOL = 80;

const setupEl = document.getElementById("setup");
const gameEl = document.getElementById("game");
const endEl = document.getElementById("end");

const conditionSelect = document.getElementById("condition");
const startBtn = document.getElementById("startBtn");

const timeLeftEl = document.getElementById("timeLeft");
const scoreLabelEl = document.getElementById("scoreLabel");
const livesLabelEl = document.getElementById("livesLabel");
const questionTextEl = document.getElementById("questionText");
const answerInputEl = document.getElementById("answerInput");
const endSummaryEl = document.getElementById("endSummary");

const barFillEl = document.getElementById("barFill");
const barTextEl = document.getElementById("barText");

let sessionId = "";
let participantId = "";
let condition = "gain";
let poolId = "";
let timeLeft = ROUND_SECONDS;
let intervalId = null;

let score = 0;
let barValue = 0;
let livesValue = 25;
let questionIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let currentQuestion = null;
let questionShownAt = 0;
let experimentComplete = false;
let questionPool = [];
let cachedGlobalSequence = null;

function updateLivesUI() {
  if (condition === "loss") {
    scoreLabelEl.classList.add("hidden");
    livesLabelEl.classList.remove("hidden");
    livesLabelEl.textContent = `Lives: ${livesValue}`;
  } else {
    scoreLabelEl.classList.remove("hidden");
    livesLabelEl.classList.add("hidden");
    scoreLabelEl.textContent = `Score: ${score}`;
  }
}

function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Unique ID per round (for CSV); avoids manual entry. */
function generateParticipantId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `P-${crypto.randomUUID()}`;
  }
  return `P-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const ANSWER_CONTROL_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Escape",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

function sanitizeAnswerDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function onAnswerKeydown(event) {
  if (event.key === "Enter") {
    return;
  }
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  if (ANSWER_CONTROL_KEYS.has(event.key)) {
    return;
  }
  if (/^\d$/.test(event.key)) {
    return;
  }
  event.preventDefault();
}

function onAnswerPaste(event) {
  event.preventDefault();
  const text = (event.clipboardData || window.clipboardData).getData("text");
  const digits = sanitizeAnswerDigits(text);
  const start = answerInputEl.selectionStart ?? answerInputEl.value.length;
  const end = answerInputEl.selectionEnd ?? answerInputEl.value.length;
  const before = answerInputEl.value.slice(0, start);
  const after = answerInputEl.value.slice(end);
  answerInputEl.value = sanitizeAnswerDigits(before + digits + after);
}

function onAnswerInput() {
  const cleaned = sanitizeAnswerDigits(answerInputEl.value);
  if (cleaned !== answerInputEl.value) {
    answerInputEl.value = cleaned;
  }
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

function levelsPerOperation() {
  const block = ["medium", "medium", "hard", "hard"];
  return [...block, ...block, ...block, ...block, ...block];
}

function buildQuestionFromSpec(op, level, rng) {
  let a;
  let b;
  let answer;

  // ZetaMac-like ranges, but only MEDIUM/HARD.
  // Early return keeps the frontend fallback consistent with server.js.
  if (level === "medium" || level === "hard") {
    const isHard = level === "hard";
    if (op === "+") {
      let ok = false;
      for (let t = 0; t < 3000 && !ok; t += 1) {
        const tensA = randomInt(rng, 1, 9);
        const tensB = randomInt(rng, 1, 9);
        const onesA = randomInt(rng, 0, 9);
        const onesB = randomInt(rng, 0, 9);
        if (onesA + onesB < 10) continue; // require ones carry

        const tensSum = tensA + tensB;
        if (isHard) {
          if (tensSum < 9) continue; // require tens carry too
        } else {
          if (tensSum > 8) continue; // prevent tens carry out
        }

        a = tensA * 10 + onesA;
        b = tensB * 10 + onesB;
        ok = true;
      }
      answer = a + b;
    } else if (op === "-") {
      let ok = false;
      for (let t = 0; t < 6000 && !ok; t += 1) {
        const x = randomInt(rng, 10, 99);
        const y = randomInt(rng, 10, 99);
        const aa = Math.max(x, y);
        const bb = Math.min(x, y);
        const onesA = aa % 10;
        const onesB = bb % 10;
        if (onesA >= onesB) continue; // force ones-place borrow

        const res = aa - bb;
        if (isHard) {
          if (res > 24) continue;
        } else {
          if (res < 25) continue;
        }

        a = aa;
        b = bb;
        ok = true;
      }
      answer = a - b;
    } else if (op === "x") {
      a = randomInt(rng, 2, 12);
      if (isHard) {
        b = randomInt(rng, 51, 100);
      } else {
        b = randomInt(rng, 2, 50);
      }
      answer = a * b;
    } else {
      // division
      b = randomInt(rng, 2, 12);
      if (isHard) {
        answer = randomInt(rng, 51, 100);
      } else {
        answer = randomInt(rng, 2, 50);
      }
      a = b * answer; // dividend
    }

    return { a, b, op, answer, level };
  }

  if (op === "+") {
    // Difficulty by carry pattern for 2-digit + 2-digit, plus digit-length cases.
    if (level === "easy") {
      const subtype = randomInt(rng, 0, 2);
      if (subtype === 0) {
        // 1-digit + 1-digit
        a = randomInt(rng, 1, 9);
        b = randomInt(rng, 1, 9);
      } else if (subtype === 1) {
        // 1-digit + 2-digit
        const leftIs1 = randomInt(rng, 0, 1) === 0;
        const one = randomInt(rng, 1, 9);
        const two = randomInt(rng, 10, 99);
        a = leftIs1 ? one : two;
        b = leftIs1 ? two : one;
      } else {
        // 2-digit + 2-digit with no carry at ones or tens.
        // Guarantee no carry: onesA + onesB <= 9 and tensA + tensB <= 9
        const tensA = randomInt(rng, 1, 8); // so 9 - tensA >= 1
        const tensB = randomInt(rng, 1, 9 - tensA);
        const onesA = randomInt(rng, 0, 9);
        const onesB = randomInt(rng, 0, 9 - onesA);
        a = tensA * 10 + onesA;
        b = tensB * 10 + onesB;
      }
      answer = a + b;
    } else if (level === "medium") {
      // 2-digit + 2-digit with exactly one carry (ones carry, but no carry out of tens).
      let ok = false;
      for (let t = 0; t < 1000 && !ok; t += 1) {
        const tensA = randomInt(rng, 1, 9);
        const tensB = randomInt(rng, 1, 9);
        if (tensA + tensB > 8) continue;
        const onesA = randomInt(rng, 0, 9);
        const onesB = randomInt(rng, 0, 9);
        if (onesA + onesB < 10) continue;
        a = tensA * 10 + onesA;
        b = tensB * 10 + onesB;
        ok = true;
      }
      answer = a + b;
    } else {
      // 2-digit + 2-digit with multiple carries (tens carry out after ones carry).
      let ok = false;
      for (let t = 0; t < 1000 && !ok; t += 1) {
        const tensA = randomInt(rng, 1, 9);
        const tensB = randomInt(rng, 1, 9);
        if (tensA + tensB < 9) continue;
        const onesA = randomInt(rng, 0, 9);
        const onesB = randomInt(rng, 0, 9);
        if (onesA + onesB < 10) continue;
        a = tensA * 10 + onesA;
        b = tensB * 10 + onesB;
        ok = true;
      }
      answer = a + b;
    }
  } else if (op === "-") {
    // Keep answers non-negative (a >= b) and separate by borrow-driven difficulty.
    if (level === "easy") {
      const subtype = randomInt(rng, 0, 1);
      if (subtype === 0) {
        // 2-digit - 1-digit
        a = randomInt(rng, 10, 99);
        b = randomInt(rng, 1, 9);
      } else {
        // 2-digit - 2-digit with no borrowing (onesA >= onesB)
        const tensA = randomInt(rng, 1, 9);
        const tensB = randomInt(rng, 1, tensA);
        const onesA = randomInt(rng, 0, 9);
        const onesB = randomInt(rng, 0, onesA);
        a = tensA * 10 + onesA;
        b = tensB * 10 + onesB;
      }
      if (b > a) {
        const tmp = a;
        a = b;
        b = tmp;
      }
      answer = a - b;
    } else if (level === "medium") {
      // Borrow cases with outcomes >= 25 (one borrow, moderate result).
      let ok = false;
      for (let t = 0; t < 2000 && !ok; t += 1) {
        const tensB = randomInt(rng, 1, 8);
        const tensA = randomInt(rng, tensB + 1, 9);
        const onesB = randomInt(rng, 1, 9);
        const onesA = randomInt(rng, 0, onesB - 1);
        a = tensA * 10 + onesA;
        b = tensB * 10 + onesB;
        const res = a - b;
        if (res >= 25) ok = true;
      }
      answer = a - b;
    } else {
      // Borrow cases with outcomes <= 24 (multiple borrows, smaller result).
      let ok = false;
      for (let t = 0; t < 2000 && !ok; t += 1) {
        const tensB = randomInt(rng, 1, 8);
        const tensA = randomInt(rng, tensB + 1, 9);
        const onesB = randomInt(rng, 1, 9);
        const onesA = randomInt(rng, 0, onesB - 1);
        a = tensA * 10 + onesA;
        b = tensB * 10 + onesB;
        const res = a - b;
        if (res <= 24) ok = true;
      }
      answer = a - b;
    }
  } else if (op === "x") {
    if (level === "easy") {
      // 1-digit × 1-digit, operands 2..9
      a = randomInt(rng, 2, 9);
      b = randomInt(rng, 2, 9);
    } else if (level === "medium") {
      // 1-digit × 2-digit, where the 2-digit operand is 10..30
      const one = randomInt(rng, 2, 9);
      const two = randomInt(rng, 10, 30);
      const leftIsOne = randomInt(rng, 0, 1) === 0;
      a = leftIsOne ? one : two;
      b = leftIsOne ? two : one;
    } else {
      // 1-digit × 2-digit, where the 2-digit operand is 31..100
      const one = randomInt(rng, 2, 9);
      const two = randomInt(rng, 31, 100);
      const leftIsOne = randomInt(rng, 0, 1) === 0;
      a = leftIsOne ? one : two;
      b = leftIsOne ? two : one;
    }
    answer = a * b;
  } else {
    // Division: whole-number answers only.
    if (level === "easy") {
      // dividend <= 81, divisor 2..9
      let ok = false;
      for (let t = 0; t < 200 && !ok; t += 1) {
        b = randomInt(rng, 2, 9);
        const qMax = Math.floor(81 / b);
        if (qMax < 2) continue;
        answer = randomInt(rng, 2, qMax);
        a = b * answer;
        if (a <= 81) ok = true;
      }
    } else if (level === "medium") {
      // dividend 82..150, divisor 2..12
      let ok = false;
      for (let t = 0; t < 500 && !ok; t += 1) {
        b = randomInt(rng, 2, 12);
        const qMin = Math.ceil(82 / b);
        const qMax = Math.floor(150 / b);
        if (qMin > qMax) continue;
        answer = randomInt(rng, qMin, qMax);
        a = b * answer;
        if (a >= 82 && a <= 150) ok = true;
      }
    } else {
      // dividend 151..1200, divisor 2..12
      let ok = false;
      for (let t = 0; t < 500 && !ok; t += 1) {
        b = randomInt(rng, 2, 12);
        const qMin = Math.ceil(151 / b);
        const qMax = Math.floor(1200 / b);
        if (qMin > qMax) continue;
        answer = randomInt(rng, qMin, qMax);
        a = b * answer;
        if (a >= 151 && a <= 1200) ok = true;
      }
    }
  }

  return { a, b, op, answer, level };
}

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

function getGlobalQuestionSequence() {
  if (!cachedGlobalSequence) {
    cachedGlobalSequence = generateGlobalFixedSequence();
  }
  return cachedGlobalSequence;
}

function getFallbackSessionConfig(chosenCondition) {
  return {
    condition: chosenCondition === "loss" ? "loss" : "gain",
    poolId: GLOBAL_POOL_ID,
    roundSeconds: ROUND_SECONDS,
    questionsPerPool: QUESTIONS_PER_POOL,
    questions: getGlobalQuestionSequence(),
  };
}

function updateBar() {
  if (condition === "gain") {
    barFillEl.className = "bar-fill";
    const max = Math.max(1, questionPool.length);
    const percent = Math.max(0, Math.min(100, (barValue / max) * 100));
    barFillEl.style.width = `${percent}%`;
    barTextEl.textContent = `Gain: ${barValue}`;
  } else {
    barFillEl.className = "bar-fill";
    const percent = Math.max(0, Math.min(100, (barValue / LOSS_START) * 100));
    barFillEl.style.width = `${percent}%`;
    barTextEl.textContent = `Loss remaining: ${barValue}`;
  }
}

function updateTopInfo() {
  timeLeftEl.textContent = `Seconds left: ${timeLeft}`;
  updateLivesUI();
}

function nextQuestion() {
  if (questionIndex >= questionPool.length) {
    endRound();
    return;
  }
  currentQuestion = questionPool[questionIndex];
  questionShownAt = performance.now();
  questionTextEl.textContent = `${currentQuestion.a} ${currentQuestion.op} ${currentQuestion.b} =`;
  answerInputEl.value = "";
  answerInputEl.focus();
}

async function logAttempt(userAnswer, isCorrect, reactionTimeMs) {
  const payload = {
    sessionId,
    participantId,
    condition,
    poolId,
    questionIndex: questionIndex + 1,
    operation: currentQuestion.op,
    leftOperand: currentQuestion.a,
    rightOperand: currentQuestion.b,
    correctAnswer: currentQuestion.answer,
    userAnswer,
    isCorrect,
    runningScore: condition === "gain" ? score : "",
    reactionTimeMs: Math.round(reactionTimeMs),
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Keep game running even if logging fails temporarily.
    console.error("Log failed", err);
  }
}

function applyScoring(isCorrect) {
  if (isCorrect) {
    correctCount += 1;
    if (condition === "gain") {
      score += 1;
      barValue += BAR_STEP_CORRECT;
    }
  } else {
    wrongCount += 1;
    if (condition === "loss") {
      livesValue = Math.max(0, livesValue - 1);
      barValue = Math.max(0, barValue - BAR_STEP_WRONG);
    }
  }
}

async function submitAnswer() {
  if (!currentQuestion || experimentComplete) return;
  const raw = sanitizeAnswerDigits(answerInputEl.value);
  if (raw.length === 0) return;

  const userAnswer = Number(raw);
  const isCorrect = userAnswer === currentQuestion.answer;
  const reactionTimeMs = performance.now() - questionShownAt;

  applyScoring(isCorrect);
  await logAttempt(userAnswer, isCorrect, reactionTimeMs);
  questionIndex += 1;
  updateTopInfo();
  updateBar();
  nextQuestion();
}

function endRound() {
  if (experimentComplete) return;
  experimentComplete = true;
  clearInterval(intervalId);
  intervalId = null;

  gameEl.classList.add("hidden");
  endEl.classList.remove("hidden");

  const scorePart = condition === "gain" ? `Score: ${score}, ` : "";
  const livesPart = condition === "loss" ? `Lives: ${livesValue}, ` : "";
  endSummaryEl.textContent =
    `Participant ${participantId || "N/A"} finished ${condition.toUpperCase()} condition. ` +
    `Pool: ${poolId}, ${scorePart}${livesPart}Correct: ${correctCount}, Wrong: ${wrongCount}, ` +
    `Final bar value: ${barValue}.`;
}

async function startRound() {
  sessionId = makeSessionId();
  participantId = generateParticipantId();
  const chosenCondition = conditionSelect.value;
  if (!chosenCondition) {
    window.alert("Please choose Gain or Loss framing before starting.");
    return;
  }

  let sessionConfig = null;
  try {
    const response = await fetch(`/api/session-config?condition=${encodeURIComponent(chosenCondition)}`);
    if (response.ok) {
      sessionConfig = await response.json();
    }
  } catch (err) {
    console.warn("Session config API unavailable, using local fallback pools.", err);
  }
  if (!sessionConfig || !Array.isArray(sessionConfig.questions) || sessionConfig.questions.length === 0) {
    sessionConfig = getFallbackSessionConfig(chosenCondition);
  }

  condition = sessionConfig.condition;
  poolId = sessionConfig.poolId;
  questionPool = sessionConfig.questions || [];
  timeLeft = Number(sessionConfig.roundSeconds || ROUND_SECONDS);
  score = 0;
  questionIndex = 0;
  correctCount = 0;
  wrongCount = 0;
  experimentComplete = false;
  barValue = condition === "gain" ? 0 : LOSS_START;
  livesValue = 25;

  setupEl.classList.add("hidden");
  endEl.classList.add("hidden");
  gameEl.classList.remove("hidden");

  updateTopInfo();
  updateBar();
  updateLivesUI();
  nextQuestion();

  intervalId = setInterval(() => {
    timeLeft -= 1;
    updateTopInfo();
    if (timeLeft <= 0) {
      endRound();
    }
  }, 1000);
}

startBtn.addEventListener("click", startRound);
answerInputEl.addEventListener("keydown", (event) => {
  onAnswerKeydown(event);
  if (event.key === "Enter") {
    submitAnswer();
  }
});
answerInputEl.addEventListener("paste", onAnswerPaste);
answerInputEl.addEventListener("input", onAnswerInput);
