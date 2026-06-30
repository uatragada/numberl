import { useMemo, useState } from "react";
import {
  AI_BENCHMARK,
  MAX_QUESTIONS,
  MAX_TYPE_QUESTIONS,
  NUMBER_MAX,
  NUMBER_MIN,
  answerQuestion,
  filterCandidates,
  getDailyChallenge,
  makeCandidates,
  randomSecret,
  summarizeCandidates,
} from "./gameLogic";
import { TYPE_META, TYPE_ORDER } from "./questions";

const STATS_KEY = "number-guessing-rl-human-stats-v2";
const MODULAR_DIVISORS = [2, 3, 4, 5];
const DIVISIBLE_DIVISORS = [6, 7, 9, 11, 25];
const DIGIT_POSITIONS = ["hundreds", "tens", "units"];
const SPECIAL_PROPERTIES = [
  ["perfect_square", "a perfect square"],
  ["prime", "prime"],
  ["palindrome", "a palindrome"],
  ["fibonacci", "a Fibonacci number"],
  ["repeated_digit", "a number with a repeated digit"],
  ["power_of_2", "a power of 2"],
  ["triangular", "a triangular number"],
  ["digit_sum_prime", "a number whose digit sum is prime"],
];
const DEFAULT_BUILDER = {
  type: "range",
  low: 1,
  high: 500,
  a: 250,
  b: 750,
  divisor: 2,
  threshold: 10,
  property: "prime",
  pos1: "hundreds",
  pos2: "units",
  divisibleBy: 7,
};

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { games: 0, wins: 0, bestWinQuestions: null };
    return JSON.parse(raw);
  } catch {
    return { games: 0, wins: 0, bestWinQuestions: null };
  }
}

function saveStats(nextStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function questionKey(question) {
  if (question.type === "range") return `range:${question.low}:${question.high}`;
  if (question.type === "proximity") return `proximity:${question.a}:${question.b}`;
  if (question.type === "parity") return "parity";
  if (question.type === "modular") return `modular:${question.divisor}`;
  if (question.type === "digit_sum") return `digit_sum:${question.threshold}`;
  if (question.type === "special") return `special:${question.property}`;
  if (question.type === "digit_compare") {
    return `digit_compare:${question.pos1}:${question.pos2}`;
  }
  if (question.type === "divisible") return `divisible:${question.divisor}`;
  return question.type;
}

function specialPropertyLabel(property) {
  return SPECIAL_PROPERTIES.find(([value]) => value === property)?.[1] ?? property;
}

function buildQuestion(builder) {
  if (builder.type === "range") {
    const low = clampInteger(builder.low, NUMBER_MIN, NUMBER_MAX, NUMBER_MIN);
    const high = clampInteger(builder.high, NUMBER_MIN, NUMBER_MAX, NUMBER_MAX);
    const question = {
      type: "range",
      low,
      high,
      text: `Is the number between ${low} and ${high}?`,
    };
    return {
      error: low <= high ? "" : "low must be <= high",
      question: { ...question, key: questionKey(question) },
    };
  }

  if (builder.type === "proximity") {
    const a = clampInteger(builder.a, NUMBER_MIN, NUMBER_MAX, 250);
    const b = clampInteger(builder.b, NUMBER_MIN, NUMBER_MAX, 750);
    const question = {
      type: "proximity",
      a,
      b,
      text: `Is the number closer to ${a} or ${b}?`,
    };
    return {
      error: a !== b ? "" : "pick two different numbers",
      question: { ...question, key: questionKey(question) },
    };
  }

  if (builder.type === "parity") {
    const question = {
      type: "parity",
      text: "Is the number even or odd?",
    };
    return { error: "", question: { ...question, key: questionKey(question) } };
  }

  if (builder.type === "modular") {
    const divisor = MODULAR_DIVISORS.includes(Number(builder.divisor))
      ? Number(builder.divisor)
      : 2;
    const question = {
      type: "modular",
      divisor,
      text: `What is the number modulo ${divisor}?`,
    };
    return { error: "", question: { ...question, key: questionKey(question) } };
  }

  if (builder.type === "digit_sum") {
    const threshold = clampInteger(builder.threshold, 1, 27, 10);
    const question = {
      type: "digit_sum",
      threshold,
      text: `Is the digit sum greater than ${threshold}?`,
    };
    return { error: "", question: { ...question, key: questionKey(question) } };
  }

  if (builder.type === "special") {
    const property = SPECIAL_PROPERTIES.some(([value]) => value === builder.property)
      ? builder.property
      : "prime";
    const question = {
      type: "special",
      property,
      text: `Is the number ${specialPropertyLabel(property)}?`,
    };
    return { error: "", question: { ...question, key: questionKey(question) } };
  }

  if (builder.type === "digit_compare") {
    const pos1 = DIGIT_POSITIONS.includes(builder.pos1) ? builder.pos1 : "hundreds";
    const pos2 = DIGIT_POSITIONS.includes(builder.pos2) ? builder.pos2 : "units";
    const question = {
      type: "digit_compare",
      pos1,
      pos2,
      text: `Is the ${pos1} digit greater than the ${pos2} digit?`,
    };
    return {
      error: pos1 !== pos2 ? "" : "choose two different digit places",
      question: { ...question, key: questionKey(question) },
    };
  }

  const divisor = DIVISIBLE_DIVISORS.includes(Number(builder.divisibleBy))
    ? Number(builder.divisibleBy)
    : 7;
  const question = {
    type: "divisible",
    divisor,
    text: `Is the number divisible by ${divisor}?`,
  };
  return { error: "", question: { ...question, key: questionKey(question) } };
}

function buildRunLog({ mode, dailyKey, secret, guess, result, history }) {
  return {
    app: "numberl",
    mode,
    dailyKey: mode === "daily" ? dailyKey : null,
    timestamp: new Date().toISOString(),
    secret,
    guess,
    won: result.won,
    questionsAsked: history.length,
    aiBenchmarkSuccessRatePct: AI_BENCHMARK,
    questions: history.map((entry, index) => ({
      step: index + 1,
      actionId: entry.question.key,
      type: entry.question.type,
      text: entry.question.text,
      answer: entry.answer,
      candidatesRemaining: entry.candidatesAfter,
    })),
  };
}

export default function App() {
  const daily = useMemo(() => getDailyChallenge(), []);
  const [mode, setMode] = useState("daily");
  const [practiceSecret, setPracticeSecret] = useState(() => randomSecret());
  const [history, setHistory] = useState([]);
  const [candidates, setCandidates] = useState(() => makeCandidates());
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [builder, setBuilder] = useState(DEFAULT_BUILDER);
  const [stats, setStats] = useState(() => loadStats());
  const [copied, setCopied] = useState(false);

  const secret = mode === "daily" ? daily.secret : practiceSecret;
  const currentSlot = Math.min(history.length, MAX_QUESTIONS - 1);
  const canAsk = history.length < MAX_QUESTIONS && !result;

  const usedQuestionKeys = useMemo(
    () => new Set(history.map((entry) => entry.question.key)),
    [history]
  );

  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(TYPE_ORDER.map((type) => [type, 0]));
    for (const entry of history) counts[entry.question.type] += 1;
    return counts;
  }, [history]);

  const candidateSummary = useMemo(
    () => summarizeCandidates(candidates),
    [candidates]
  );

  const builtQuestion = useMemo(() => buildQuestion(builder), [builder]);

  function resetRound(nextMode = mode) {
    setHistory([]);
    setCandidates(makeCandidates());
    setGuess("");
    setResult(null);
    setError("");
    setCopied(false);
    if (nextMode === "practice") setPracticeSecret(randomSecret());
  }

  function switchMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    resetRound(nextMode);
  }

  function disabledReason(question, validationError = "") {
    if (!canAsk) return "done";
    if (validationError) return validationError;
    if (usedQuestionKeys.has(question.key)) return "used";
    if (typeCounts[question.type] >= MAX_TYPE_QUESTIONS) return "type cap";
    return "";
  }

  function askBuiltQuestion() {
    const { error: validationError, question } = builtQuestion;
    if (disabledReason(question, validationError)) return;

    const answer = answerQuestion(secret, question);
    const nextCandidates = filterCandidates(candidates, question, answer);

    setHistory((items) => [
      ...items,
      {
        question,
        answer,
        candidatesBefore: candidates.length,
        candidatesAfter: nextCandidates.length,
      },
    ]);
    setCandidates(nextCandidates);
    setError("");
  }

  function submitGuess(event) {
    event.preventDefault();
    if (result) return;

    const numericGuess = Number(guess);
    if (!Number.isInteger(numericGuess)) {
      setError("Enter a whole number.");
      return;
    }
    if (numericGuess < NUMBER_MIN || numericGuess > NUMBER_MAX) {
      setError(`Guess must be between ${NUMBER_MIN} and ${NUMBER_MAX}.`);
      return;
    }

    const won = numericGuess === secret;
    const nextResult = {
      won,
      guess: numericGuess,
      secret,
      offBy: Math.abs(numericGuess - secret),
    };
    setResult(nextResult);
    setError("");

    const nextStats = {
      games: stats.games + 1,
      wins: stats.wins + (won ? 1 : 0),
      bestWinQuestions: won
        ? Math.min(stats.bestWinQuestions ?? MAX_QUESTIONS, history.length)
        : stats.bestWinQuestions,
    };
    setStats(nextStats);
    saveStats(nextStats);
  }

  async function copyRun() {
    if (!result) return;
    const payload = buildRunLog({
      mode,
      dailyKey: daily.key,
      secret,
      guess: result.guess,
      result,
      history,
    });

    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="page">
      <section className="puzzle" aria-label="Numberl puzzle">
        <header className="header">
          <h1>Numberl</h1>
          <div className="modeSwitch" aria-label="Game mode">
            <button
              className={mode === "daily" ? "selected" : ""}
              type="button"
              onClick={() => switchMode("daily")}
            >
              Daily
            </button>
            <button
              className={mode === "practice" ? "selected" : ""}
              type="button"
              onClick={() => switchMode("practice")}
            >
              Practice
            </button>
          </div>
        </header>

        <div className="statusLine">
          <span>
            {history.length}/{MAX_QUESTIONS} questions · {candidateSummary.count} left
          </span>
        </div>

        <div className="playLayout">
          <CandidateGrid
            candidates={candidates}
            lastEntry={history[history.length - 1]}
            summary={candidateSummary}
          />

          <div className="questionColumn">
            <div className="rows" aria-label="Question history">
              {Array.from({ length: MAX_QUESTIONS }, (_, index) => {
                const entry = history[index];
                const isCurrent = canAsk && index === currentSlot;

                return (
                  <div
                    className={`slot ${entry ? "filled" : ""} ${isCurrent ? "active" : ""}`}
                    key={index}
                  >
                    <div className="slotRow">
                      <span className="slotNumber">{index + 1}</span>
                      <span className="slotQuestion">
                        {entry
                          ? entry.question.text
                          : isCurrent
                            ? "Build a question"
                            : "build question"}
                      </span>
                      <span
                        className={`answerChip ${entry?.answer === "no" ? "no" : ""}`}
                      >
                        {entry ? entry.answer : "-"}
                      </span>
                    </div>

                    {isCurrent && (
                      <StatementBuilder
                        builder={builder}
                        builtQuestion={builtQuestion}
                        typeCounts={typeCounts}
                        disabledReason={disabledReason}
                        onAsk={askBuiltQuestion}
                        setBuilder={setBuilder}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <form className="guessForm" onSubmit={submitGuess}>
              <input
                inputMode="numeric"
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                placeholder="Enter your final guess (1-1000)"
                aria-label="Final guess"
                disabled={Boolean(result)}
              />
              <button type="submit" disabled={Boolean(result) || !guess.trim()}>
                Submit
              </button>
            </form>

            {error && <p className="errorText">{error}</p>}

            {result && (
              <ResultPanel
                result={result}
                historyLength={history.length}
                copied={copied}
                copyRun={copyRun}
                reset={() => resetRound(mode)}
              />
            )}
          </div>
        </div>

        <footer className="footer">
          <span>AI {formatPercent(AI_BENCHMARK)} · no mod 10</span>
          <button type="button" onClick={() => resetRound(mode)}>
            new
          </button>
        </footer>
      </section>
    </main>
  );
}

function getCandidateGridModel(candidates, summary) {
  const candidateSet = new Set(candidates);
  const gridSide = Math.ceil(Math.sqrt(summary.max));
  const gridMax = gridSide * gridSide;
  const showLabels = gridSide <= 20;
  const cells = Array.from({ length: gridMax }, (_, index) => {
    const value = NUMBER_MIN + index;
    return {
      active: value <= NUMBER_MAX && candidateSet.has(value),
      inGameRange: value <= NUMBER_MAX,
      label: showLabels ? String(value) : "",
      value,
    };
  });

  return {
    activeMax: summary.max,
    activeMin: summary.min,
    cells,
    gridMax,
    gridSide,
    showLabels,
  };
}

function getBarBehavior(entry) {
  if (!entry) {
    return "Grid shows every remaining candidate across the current scale.";
  }

  const { question, answer } = entry;
  const answerText = `Answer: ${answer}.`;

  const behaviorByType = {
    range:
      answer === "yes"
        ? "Range zooms to the kept interval."
        : "Range removes that interval and redraws the remaining candidates.",
    proximity:
      answer === "equidistant"
        ? "Proximity keeps only the midpoint tie."
        : "Proximity keeps the side closer to the answer.",
    parity: "Parity leaves alternating candidate cells.",
    modular: "Modulo leaves repeating remainder cells.",
    digit_sum: "Digit sum keeps numbers matching the threshold result.",
    special: "Special properties create sparse matching cells.",
    digit_compare: "Digit comparison keeps numbers matching the digit pattern.",
    divisible: "Divisibility keeps or removes regular multiple cells.",
  };

  return `${answerText} ${behaviorByType[question.type]}`;
}

function CandidateGrid({ candidates, lastEntry, summary }) {
  const model = useMemo(
    () => getCandidateGridModel(candidates, summary),
    [candidates, summary]
  );
  const behavior = getBarBehavior(lastEntry);

  return (
    <div
      className="candidateGrid"
      aria-label={`${summary.count} candidates remaining. Active candidates run from ${summary.min} to ${summary.max}. Grid is ${model.gridSide} by ${model.gridSide}, ending at ${model.gridMax}. ${behavior}`}
      style={{ "--grid-side": model.gridSide }}
    >
      <div className="gridText">
        <span>1</span>
        <span>{model.gridMax}</span>
      </div>
      <div className="numberGrid" aria-hidden="true">
        {model.cells.map((cell, index) => (
          <span
            className={`numberCell ${cell.active ? "active" : "inactive"} ${
              cell.inGameRange ? "" : "outside"
            } ${model.showLabels ? "labeled" : "unlabeled"}`}
            key={index}
            title={String(cell.value)}
          >
            {cell.label}
          </span>
        ))}
      </div>
      <div className="gridScale">
        <span>1</span>
        <span>
          active {model.activeMin}-{model.activeMax}
        </span>
        <span>{model.gridMax}</span>
      </div>
      <p className="gridBehavior">{behavior}</p>
    </div>
  );
}

function StatementBuilder({
  builder,
  builtQuestion,
  typeCounts,
  disabledReason,
  onAsk,
  setBuilder,
}) {
  const activeType = builder.type;
  const activeCount = typeCounts[activeType] ?? 0;
  const reason = disabledReason(builtQuestion.question, builtQuestion.error);

  function updateBuilder(patch) {
    setBuilder((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="picker">
      <div className="tabs" aria-label="Question type">
        {TYPE_ORDER.map((type) => (
          <button
            className={activeType === type ? "selected" : ""}
            key={type}
            type="button"
            onClick={() => updateBuilder({ type })}
          >
            {TYPE_META[type].shortLabel}
          </button>
        ))}
      </div>

      <div className="pickerMeta">
        <span>
          {TYPE_META[activeType].label} {activeCount}/{MAX_TYPE_QUESTIONS}
        </span>
        {activeType === "modular" && <strong>No mod 10</strong>}
      </div>

      <div className="builder">
        <BuilderFields builder={builder} updateBuilder={updateBuilder} />
        <div className="builderPreview">
          <span>{builtQuestion.question.text}</span>
        </div>
        <button
          className="askButton"
          disabled={Boolean(reason)}
          type="button"
          onClick={onAsk}
        >
          Ask
        </button>
        {reason && <p className="builderNotice">{reason}</p>}
      </div>
    </div>
  );
}

function BuilderFields({ builder, updateBuilder }) {
  if (builder.type === "range") {
    return (
      <div className="statementRow">
        <span>between</span>
        <NumberSlot
          ariaLabel="Range start"
          value={builder.low}
          onChange={(low) => updateBuilder({ low })}
        />
        <span>and</span>
        <NumberSlot
          ariaLabel="Range end"
          value={builder.high}
          onChange={(high) => updateBuilder({ high })}
        />
      </div>
    );
  }

  if (builder.type === "proximity") {
    return (
      <div className="statementRow">
        <span>closer to</span>
        <NumberSlot
          ariaLabel="First comparison number"
          value={builder.a}
          onChange={(a) => updateBuilder({ a })}
        />
        <span>or</span>
        <NumberSlot
          ariaLabel="Second comparison number"
          value={builder.b}
          onChange={(b) => updateBuilder({ b })}
        />
      </div>
    );
  }

  if (builder.type === "parity") {
    return (
      <div className="statementRow">
        <span>even or odd</span>
      </div>
    );
  }

  if (builder.type === "modular") {
    return (
      <div className="statementRow">
        <span>modulo</span>
        <SelectSlot
          ariaLabel="Modulo divisor"
          value={builder.divisor}
          onChange={(divisor) => updateBuilder({ divisor: Number(divisor) })}
          options={MODULAR_DIVISORS.map((value) => [value, value])}
        />
      </div>
    );
  }

  if (builder.type === "digit_sum") {
    return (
      <div className="statementRow">
        <span>digit sum greater than</span>
        <NumberSlot
          ariaLabel="Digit sum threshold"
          max={27}
          min={1}
          value={builder.threshold}
          onChange={(threshold) => updateBuilder({ threshold })}
        />
      </div>
    );
  }

  if (builder.type === "special") {
    return (
      <div className="statementRow">
        <span>number is</span>
        <SelectSlot
          ariaLabel="Special property"
          value={builder.property}
          onChange={(property) => updateBuilder({ property })}
          options={SPECIAL_PROPERTIES}
        />
      </div>
    );
  }

  if (builder.type === "digit_compare") {
    return (
      <div className="statementRow">
        <span>is</span>
        <SelectSlot
          ariaLabel="First digit place"
          value={builder.pos1}
          onChange={(pos1) => updateBuilder({ pos1 })}
          options={DIGIT_POSITIONS.map((value) => [value, value])}
        />
        <span>greater than</span>
        <SelectSlot
          ariaLabel="Second digit place"
          value={builder.pos2}
          onChange={(pos2) => updateBuilder({ pos2 })}
          options={DIGIT_POSITIONS.map((value) => [value, value])}
        />
      </div>
    );
  }

  return (
    <div className="statementRow">
      <span>divisible by</span>
      <SelectSlot
        ariaLabel="Divisor"
        value={builder.divisibleBy}
        onChange={(divisibleBy) => updateBuilder({ divisibleBy: Number(divisibleBy) })}
        options={DIVISIBLE_DIVISORS.map((value) => [value, value])}
      />
    </div>
  );
}

function NumberSlot({
  ariaLabel,
  max = NUMBER_MAX,
  min = NUMBER_MIN,
  onChange,
  value,
}) {
  return (
    <input
      aria-label={ariaLabel}
      className="builderInput"
      inputMode="numeric"
      max={max}
      min={min}
      onChange={(event) => onChange(event.target.value)}
      type="number"
      value={value}
    />
  );
}

function SelectSlot({ ariaLabel, onChange, options, value }) {
  return (
    <select
      aria-label={ariaLabel}
      className="builderSelect"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function ResultPanel({
  result,
  historyLength,
  copied,
  copyRun,
  reset,
}) {
  return (
    <div className={`result ${result.won ? "win" : "miss"}`} role="status">
      <h2>{result.won ? "You got it" : "Missed it"}</h2>
      <p>
        Guess {result.guess}. Secret {result.secret}. Off by {result.offBy}.
      </p>
      <p>
        {result.won
          ? `Solved in ${historyLength} questions.`
          : `AI benchmark is ${formatPercent(AI_BENCHMARK)}.`}
      </p>
      <div className="resultActions">
        <button type="button" onClick={copyRun}>
          {copied ? "Copied" : "Copy run"}
        </button>
        <button type="button" onClick={reset}>
          Play again
        </button>
      </div>
    </div>
  );
}
