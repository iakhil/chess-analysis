const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const API_KEY_STORAGE_KEY = "chess-pgn-coach-openai-key";
const MODEL_STORAGE_KEY = "chess-pgn-coach-openai-model";

const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const pgnEl = document.getElementById("pgn");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusEl = document.getElementById("status");
const gamePickerWrap = document.getElementById("gamePickerWrap");
const gamePicker = document.getElementById("gamePicker");
const boardCard = document.getElementById("boardCard");
const boardEl = document.getElementById("board");
const boardErrorEl = document.getElementById("boardError");
const startBtn = document.getElementById("startBtn");
const prevBtn = document.getElementById("prevBtn");
const playBtn = document.getElementById("playBtn");
const nextBtn = document.getElementById("nextBtn");
const plyLabel = document.getElementById("plyLabel");
const resultsCard = document.getElementById("resultsCard");
const reportEl = document.getElementById("report");
const mistakesBody = document.getElementById("mistakesBody");

let replayFens = ["start"];
let replayIndex = 0;
let autoplayTimer = null;
let analyzedGames = [];
let selectedGameIndex = 0;

hydrateSavedSettings();

function hydrateSavedSettings() {
  const savedKey = window.localStorage.getItem(API_KEY_STORAGE_KEY);
  const savedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
  if (savedKey && apiKeyEl) {
    apiKeyEl.value = savedKey;
  }
  if (savedModel && modelEl) {
    modelEl.value = savedModel;
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  if (playBtn) {
    playBtn.textContent = "Play";
  }
}

function setBoardPosition(fen) {
  if (!boardEl) {
    return;
  }
  if (typeof boardEl.setPosition === "function") {
    boardEl.setPosition(fen);
    return;
  }
  if ("position" in boardEl) {
    boardEl.position = fen;
    return;
  }
  boardEl.setAttribute("position", fen);
}

function renderReplay() {
  if (!boardEl) {
    return;
  }
  setBoardPosition(replayFens[replayIndex] || "start");
  plyLabel.textContent = `Ply ${replayIndex}`;
}

function buildReplayFromMoves(movesUci) {
  const ChessCtor = window.Chess || (window.chess && window.chess.Chess);
  if (!ChessCtor) {
    throw new Error("chess.js failed to load");
  }
  const game = new ChessCtor();
  const fens = [game.fen()];
  for (const uci of movesUci || []) {
    const move = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    };
    const ok = game.move(move);
    if (!ok) {
      throw new Error(`Could not replay move: ${uci}`);
    }
    fens.push(game.fen());
  }
  replayFens = fens;
  replayIndex = 0;
  renderReplay();
}

function renderCurrentGame() {
  const game = analyzedGames[selectedGameIndex];
  if (!game) {
    return;
  }

  reportEl.textContent = game.report || "No report generated.";
  if (boardErrorEl) {
    boardErrorEl.textContent = "";
  }
  try {
    buildReplayFromMoves(game.analysis?.moves_uci || []);
  } catch (boardErr) {
    if (boardErrorEl) {
      boardErrorEl.textContent = `Board replay unavailable: ${boardErr.message}`;
    }
  }

  const rows = (game.analysis?.top_mistakes || [])
    .map(
      (m) =>
        `<tr><td>${esc(m.ply)}</td><td>${esc(m.mover)}</td><td>${esc(m.played)}</td><td>${esc(m.bestmove)}</td><td>${esc(Math.round(m.loss_cp))}</td></tr>`
    )
    .join("");
  mistakesBody.innerHTML = rows || `<tr><td colspan="5">No major mistakes detected.</td></tr>`;
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("OpenAI returned an empty response.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function buildPrompt(game) {
  return [
    "You are a practical chess coach.",
    "You are given Stockfish-based analysis from the server and should use it heavily.",
    "Return JSON only.",
    "Base your coaching primarily on the engine findings, emphasizing recurring patterns and actionable fixes.",
    'Return this shape exactly: {"report":"string","coachNotes":[{"ply":number|null,"mover":"White|Black|Unknown","played":"string","theme":"string","explanation":"string"}]}',
    "The report should be markdown with sections: Overview, Key Mistakes, Themes, Practice Plan.",
    "coachNotes should contain at most 8 concrete moments grounded in the analysis.top_mistakes or analysis.all_reviews data.",
    "",
    "Engine analysis JSON:",
    JSON.stringify(game.analysis, null, 2),
  ].join("\n");
}

async function generateCoachingReport(game, apiKey, model) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt(game),
            },
          ],
        },
      ],
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "OpenAI request failed.";
    throw new Error(message);
  }

  const parsed = extractJsonObject(data.output_text);
  return {
    report: typeof parsed.report === "string" ? parsed.report.trim() : "No report returned.",
    coachNotes: Array.isArray(parsed.coachNotes) ? parsed.coachNotes : [],
  };
}

function setWorkingState(isWorking) {
  analyzeBtn.disabled = isWorking;
  if (apiKeyEl) {
    apiKeyEl.disabled = isWorking;
  }
  if (modelEl) {
    modelEl.disabled = isWorking;
  }
  if (clearKeyBtn) {
    clearKeyBtn.disabled = isWorking;
  }
}

startBtn?.addEventListener("click", () => {
  stopAutoplay();
  replayIndex = 0;
  renderReplay();
});

prevBtn?.addEventListener("click", () => {
  stopAutoplay();
  replayIndex = Math.max(0, replayIndex - 1);
  renderReplay();
});

nextBtn?.addEventListener("click", () => {
  stopAutoplay();
  replayIndex = Math.min(replayFens.length - 1, replayIndex + 1);
  renderReplay();
});

playBtn?.addEventListener("click", () => {
  if (autoplayTimer) {
    stopAutoplay();
    return;
  }
  playBtn.textContent = "Pause";
  autoplayTimer = setInterval(() => {
    if (replayIndex >= replayFens.length - 1) {
      stopAutoplay();
      return;
    }
    replayIndex += 1;
    renderReplay();
  }, 700);
});

gamePicker?.addEventListener("change", () => {
  stopAutoplay();
  selectedGameIndex = Number(gamePicker.value) || 0;
  renderCurrentGame();
});

clearKeyBtn?.addEventListener("click", () => {
  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  if (apiKeyEl) {
    apiKeyEl.value = "";
    apiKeyEl.focus();
  }
  statusEl.textContent = "Saved API key cleared from this browser.";
});

analyzeBtn.addEventListener("click", async () => {
  const apiKey = apiKeyEl?.value.trim() || "";
  const model = modelEl?.value.trim() || "gpt-4.1-mini";
  const pgn = pgnEl.value.trim();

  if (!apiKey) {
    statusEl.textContent = "Enter an OpenAI API key first.";
    return;
  }
  if (!pgn) {
    statusEl.textContent = "Please paste a PGN first.";
    return;
  }

  setWorkingState(true);
  stopAutoplay();
  if (boardErrorEl) {
    boardErrorEl.textContent = "";
  }
  boardCard.hidden = true;
  resultsCard.hidden = true;
  analyzedGames = [];
  selectedGameIndex = 0;
  if (gamePickerWrap) {
    gamePickerWrap.hidden = true;
  }

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgn }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Analysis request failed.");
    }

    analyzedGames = (data.games || []).map((game) => ({
      ...game,
      report: "",
      coachNotes: [],
    }));

    if (!analyzedGames.length) {
      throw new Error("No analyzed games were returned.");
    }

    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    window.localStorage.setItem(MODEL_STORAGE_KEY, model);

    statusEl.textContent = `Stockfish analysis complete. Generating coaching with ${model}...`;

    for (let idx = 0; idx < analyzedGames.length; idx += 1) {
      statusEl.textContent = `Generating coaching for game ${idx + 1} of ${analyzedGames.length} with ${model}...`;
      const result = await generateCoachingReport(analyzedGames[idx], apiKey, model);
      analyzedGames[idx].report = result.report;
      analyzedGames[idx].coachNotes = result.coachNotes;
    }

    if (gamePicker && gamePickerWrap) {
      gamePicker.innerHTML = analyzedGames
        .map((game, idx) => `<option value="${idx}">${esc(game.title || `Game ${idx + 1}`)}</option>`)
        .join("");
      gamePickerWrap.hidden = analyzedGames.length <= 1;
    }

    boardCard.hidden = false;
    selectedGameIndex = 0;
    renderCurrentGame();
    resultsCard.hidden = false;
    statusEl.textContent = `Done. Stockfish ran on the server and coaching used the browser-supplied API key.`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    setWorkingState(false);
  }
});
