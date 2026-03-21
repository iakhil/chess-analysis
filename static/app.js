const PLAYED_AS_STORAGE_KEY = "chess-pgn-coach-played-as";
const LAST_ANALYSIS_STORAGE_KEY = "chess-pgn-coach-last-analysis";

const playedAsEl = document.getElementById("playedAs");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const pgnEl = document.getElementById("pgn");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusEl = document.getElementById("status");
const analysisPulseEl = document.getElementById("analysisPulse");
const analysisMessageEl = document.getElementById("analysisMessage");
const gamePickerWrap = document.getElementById("gamePickerWrap");
const gamePicker = document.getElementById("gamePicker");
const boardCard = document.getElementById("boardCard");
const boardEl = document.getElementById("board");
const boardErrorEl = document.getElementById("boardError");
const startBtn = document.getElementById("startBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const endBtn = document.getElementById("endBtn");
const plyLabel = document.getElementById("plyLabel");
const resultsCard = document.getElementById("resultsCard");
const reportEl = document.getElementById("report");
const mistakesBody = document.getElementById("mistakesBody");

let replayFens = ["start"];
let replayIndex = 0;
let analyzedGames = [];
let selectedGameIndex = 0;

hydrateSavedSettings();
restoreLastAnalysis();

function hydrateSavedSettings() {
  const savedPlayedAs = window.localStorage.getItem(PLAYED_AS_STORAGE_KEY);
  if (savedPlayedAs && playedAsEl) {
    playedAsEl.value = savedPlayedAs;
  }
}

function persistLastAnalysis() {
  if (!analyzedGames.length) {
    window.localStorage.removeItem(LAST_ANALYSIS_STORAGE_KEY);
    return;
  }

  const payload = {
    pgn: pgnEl?.value || "",
    playedAs: playedAsEl?.value || "White",
    analyzedGames,
    selectedGameIndex,
    replayIndex,
  };
  window.localStorage.setItem(LAST_ANALYSIS_STORAGE_KEY, JSON.stringify(payload));
}

function populateGamePicker() {
  if (!gamePicker || !gamePickerWrap) {
    return;
  }
  gamePicker.innerHTML = analyzedGames
    .map((game, idx) => `<option value="${idx}">${esc(game.title || `Game ${idx + 1}`)}</option>`)
    .join("");
  gamePicker.value = String(selectedGameIndex);
  gamePickerWrap.hidden = analyzedGames.length <= 1;
}

function restoreLastAnalysis() {
  const raw = window.localStorage.getItem(LAST_ANALYSIS_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.analyzedGames) || !saved.analyzedGames.length) {
      window.localStorage.removeItem(LAST_ANALYSIS_STORAGE_KEY);
      return;
    }

    if (pgnEl && typeof saved.pgn === "string") {
      pgnEl.value = saved.pgn;
    }
    if (playedAsEl && (saved.playedAs === "White" || saved.playedAs === "Black")) {
      playedAsEl.value = saved.playedAs;
    }

    analyzedGames = saved.analyzedGames;
    selectedGameIndex = Math.max(0, Math.min(Number(saved.selectedGameIndex) || 0, analyzedGames.length - 1));
    populateGamePicker();
    boardCard.hidden = false;
    resultsCard.hidden = false;
    renderCurrentGame();
    replayIndex = Math.max(0, Math.min(Number(saved.replayIndex) || 0, replayFens.length - 1));
    renderReplay();
    statusEl.textContent = "Restored the last analyzed game from this browser.";
  } catch (_err) {
    window.localStorage.removeItem(LAST_ANALYSIS_STORAGE_KEY);
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInlineMarkdown(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listType) {
      return;
    }
    html.push(listType === "ol" ? "</ol>" : "</ul>");
    listType = null;
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeList();
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
      return;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
      return;
    }

    closeList();
    paragraph.push(line);
  });

  flushParagraph();
  closeList();
  return html.join("");
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

  reportEl.innerHTML = renderMarkdown(game.report || "No report generated.");
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
  if (gamePicker) {
    gamePicker.value = String(selectedGameIndex);
  }
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

async function generateCoachingReport(game, playedAs) {
  const response = await fetch("/api/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      analysis: game.analysis,
      played_as: playedAs,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.detail || "OpenAI request failed.";
    throw new Error(message);
  }

  const parsed = extractJsonObject(data.output_text || "");
  return {
    report: typeof parsed.report === "string" ? parsed.report.trim() : "No report returned.",
    coachNotes: Array.isArray(parsed.coachNotes) ? parsed.coachNotes : [],
  };
}

function setWorkingState(isWorking) {
  analyzeBtn.disabled = isWorking;
  if (playedAsEl) {
    playedAsEl.disabled = isWorking;
  }
  if (clearKeyBtn) {
    clearKeyBtn.disabled = isWorking;
  }
  if (analysisPulseEl) {
    analysisPulseEl.hidden = !isWorking;
  }
}

function setAnalysisMessage(message) {
  if (analysisMessageEl) {
    analysisMessageEl.textContent = message;
  }
}

startBtn?.addEventListener("click", () => {
  replayIndex = 0;
  renderReplay();
  persistLastAnalysis();
});

prevBtn?.addEventListener("click", () => {
  replayIndex = Math.max(0, replayIndex - 1);
  renderReplay();
  persistLastAnalysis();
});

nextBtn?.addEventListener("click", () => {
  replayIndex = Math.min(replayFens.length - 1, replayIndex + 1);
  renderReplay();
  persistLastAnalysis();
});

endBtn?.addEventListener("click", () => {
  replayIndex = Math.max(0, replayFens.length - 1);
  renderReplay();
  persistLastAnalysis();
});

gamePicker?.addEventListener("change", () => {
  selectedGameIndex = Number(gamePicker.value) || 0;
  renderCurrentGame();
  persistLastAnalysis();
});

clearKeyBtn?.addEventListener("click", () => {
  window.localStorage.removeItem(PLAYED_AS_STORAGE_KEY);
  window.localStorage.removeItem(LAST_ANALYSIS_STORAGE_KEY);
  if (playedAsEl) {
    playedAsEl.value = "White";
  }
  pgnEl.value = "";
  analyzedGames = [];
  selectedGameIndex = 0;
  replayFens = ["start"];
  replayIndex = 0;
  boardCard.hidden = true;
  resultsCard.hidden = true;
  if (gamePickerWrap) {
    gamePickerWrap.hidden = true;
  }
  statusEl.textContent = "Saved session cleared from this browser.";
});

analyzeBtn.addEventListener("click", async () => {
  const playedAs = playedAsEl?.value || "";
  const pgn = pgnEl.value.trim();

  if (!playedAs) {
    statusEl.textContent = "Choose whether you played as White or Black.";
    return;
  }
  if (!pgn) {
    statusEl.textContent = "Please paste a PGN first.";
    return;
  }

  setWorkingState(true);
  setAnalysisMessage("Lining up the pieces...");
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

    setAnalysisMessage("Stockfish is probing every sharp turn...");
    analyzedGames = (data.games || []).map((game) => ({
      ...game,
      report: "",
      coachNotes: [],
    }));

    if (!analyzedGames.length) {
      throw new Error("No analyzed games were returned.");
    }

    window.localStorage.setItem(PLAYED_AS_STORAGE_KEY, playedAs);

    statusEl.textContent = `Stockfish analysis complete. Generating coaching for ${playedAs}...`;
    setAnalysisMessage("Stockfish is walking the game tree...");

    for (let idx = 0; idx < analyzedGames.length; idx += 1) {
      statusEl.textContent = `Generating coaching for game ${idx + 1} of ${analyzedGames.length} from ${playedAs}'s perspective...`;
      setAnalysisMessage(`Writing your coaching notes for game ${idx + 1} of ${analyzedGames.length}...`);
      const result = await generateCoachingReport(analyzedGames[idx], playedAs);
      analyzedGames[idx].report = result.report;
      analyzedGames[idx].coachNotes = result.coachNotes;
    }

    boardCard.hidden = false;
    selectedGameIndex = 0;
    populateGamePicker();
    renderCurrentGame();
    resultsCard.hidden = false;
    persistLastAnalysis();
    statusEl.textContent = `Done. Stockfish ran on the server and coaching used the browser-supplied API key.`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    setAnalysisMessage("Consulting the engine room...");
    setWorkingState(false);
  }
});
