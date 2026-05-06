const stage = document.querySelector("#stage");
const progress = document.querySelector("#progress");
const prevButton = document.querySelector("#prevButton");
const hintButton = document.querySelector("#hintButton");
const answerButton = document.querySelector("#answerButton");
const resetPuzzleButton = document.querySelector("#resetPuzzleButton");
const hintDialog = document.querySelector("#hintDialog");
const closeHintButton = document.querySelector("#closeHintButton");
const hintContent = document.querySelector("#hintContent");

const KEYS = "ABCDEFGHI".split("");
const SNAP_TOLERANCE = 7.5;
const MAX_HINT_LEVEL = 2;

let current = 0;
let solved = Array(10).fill(false);
let drag = null;

const puzzles = createGlyphPuzzles();
const states = puzzles.map(createState);

stage.addEventListener("pointerdown", onPointerDown);
stage.addEventListener("pointermove", onPointerMove);
stage.addEventListener("pointerup", onPointerUp);
stage.addEventListener("pointercancel", onPointerUp);

stage.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  if (action === "next") {
    current += 1;
    if (current >= puzzles.length) renderEnd();
    else render();
    return;
  }
  if (action === "new-game") {
    current = 0;
    solved = Array(10).fill(false);
    for (let index = 0; index < puzzles.length; index += 1) {
      states[index] = createState(puzzles[index]);
    }
    render();
    return;
  }
  if (current >= puzzles.length) return;

  if (action === "key") {
    pressKey(target.dataset.letter);
    return;
  }
  if (action === "clear") {
    states[current].input = "";
    states[current].wrong = false;
    renderScene();
  }
});

prevButton.addEventListener("click", () => {
  if (current > 0 && current <= puzzles.length) {
    current -= 1;
    render();
  }
});

hintButton.addEventListener("click", () => {
  if (current >= puzzles.length) return;
  const puzzleData = puzzles[current];
  const state = states[current];
  state.hintLevel = Math.min(state.hintLevel + 1, MAX_HINT_LEVEL);
  renderScene();
  const extra =
    state.hintLevel === 1
      ? "Placed pieces snap into alignment. Tap the hint again if the board still feels too ambiguous."
      : "Small center ticks and partial corners are now stronger. Every mark belongs to one fragment, but the marks do not reveal the final letters by themselves.";
  hintContent.innerHTML = `<strong>${state.hintLevel === 1 ? "First look" : "Closer look"}</strong><p>${puzzleData.hint}</p><strong>Board clue</strong><p>${extra}</p>`;
  hintDialog.showModal();
});

answerButton.addEventListener("click", () => {
  if (current >= puzzles.length) return;
  if (solved[current]) {
    current += 1;
    if (current >= puzzles.length) renderEnd();
    else render();
    return;
  }
  const puzzleData = puzzles[current];
  const state = states[current];
  revealCurrentPuzzle();
  state.input = puzzleData.code;
  state.wrong = false;
  renderScene();
  completeCurrent();
});

resetPuzzleButton.addEventListener("click", () => {
  if (current >= puzzles.length) return;
  const puzzleData = puzzles[current];
  states[current] = createState(puzzleData);
  solved[current] = false;
  render();
});

closeHintButton.addEventListener("click", () => hintDialog.close());

function puzzle(theme, name, code, hint, pieces) {
  return { theme, name, code, hint, pieces, tolerance: SNAP_TOLERANCE };
}

function piece(id, kind, x, y, w, h, targetX, targetY, rotation, z, startRotation = rotation, options = {}) {
  return { id, kind, x, y, w, h, targetX, targetY, rotation, z, startRotation, ...options };
}

function createGlyphPuzzles() {
  const specs = [
    ["DCA", "root script", "Every loose root belongs to the final drawing. Rebuild the white mark, then read the letters it makes."],
    ["FIB", "bent garden", "No loose root is a complete answer by itself. Match stems, caps, and bends into one code image."],
    ["GEA", "three stems", "Use the faint paper ticks and curve direction to place each fragment until the drawing resolves into letters."],
    ["BHD", "split seed", "Layer the bowls, stems, and bridges into one continuous white mark before reading it."],
    ["EIC", "paper orchard", "The paper marks hint at fragment positions; the rest is solved by shape continuity."],
    ["HAF", "thin crossing", "Fragments overlap in layers. Assemble the complete drawing before entering the letters."],
    ["CGB", "fallen vine", "Curves and stems only become readable after their neighboring fragments connect."],
    ["IAD", "root ladder", "Straight fragments are decoys until their caps and arcs lock them into the final code image."],
    ["FHE", "split leaves", "Read the code only after the loose roots form one coherent white drawing."],
    ["DGI", "closed drawing", "This room uses denser fragments: rebuild the image, then read the hidden code."],
  ];
  return specs.map(([code, name, hint], index) => {
    const room = index + 1;
    return puzzle("glyph", name, code, hint, code.split("").flatMap((letter, slot) => letterPieces(room, slot, letter, index)));
  });
}

function createState(puzzleData) {
  return {
    pieces: puzzleData.pieces.map((pieceData) => ({
      id: pieceData.id,
      x: pieceData.x,
      y: pieceData.y,
      rotation: pieceData.startRotation,
      placed: false,
    })),
    input: "",
    wrong: false,
    hintLevel: 0,
  };
}

function letterPieces(room, slot, letter, puzzleIndex) {
  const centerX = [27, 50, 73][slot];
  const centerY = 58;
  return letterFragments(letter).map((fragment, fragmentIndex) => {
    const serial = slot * 4 + fragmentIndex;
    const start = startPoint(puzzleIndex, serial);
    const startRotation = fragment.rotation;
    const targetX = centerX + fragment.dx;
    const targetY = centerY + fragment.dy;
    return piece(
      `p${room}-${slot}-${fragmentIndex}`,
      fragment.kind,
      start.x,
      start.y,
      fragment.w,
      fragment.h,
      targetX,
      targetY,
      fragment.rotation,
      10 + serial,
      startRotation,
    );
  });
}

function letterFragments(letter) {
  const shared = {
    stem: { kind: "frag-stem", dx: -6.4, dy: 0, w: 12.8, h: 40, rotation: 0 },
    leftStem: { kind: "frag-stem", dx: -7.6, dy: 0, w: 11.5, h: 40, rotation: 0 },
    rightStem: { kind: "frag-stem", dx: 7.6, dy: 0, w: 11.5, h: 40, rotation: 0 },
    topBar: { kind: "frag-bar", dx: 0.6, dy: -15, w: 16.5, h: 9.5, rotation: 0 },
    midBar: { kind: "frag-bar", dx: 0.1, dy: 0, w: 14.5, h: 9.2, rotation: 0 },
    bottomBar: { kind: "frag-bar", dx: 0.5, dy: 15.2, w: 16.5, h: 9.5, rotation: 0 },
    cTop: { kind: "frag-c-top", dx: 1.3, dy: -9.5, w: 18, h: 18, rotation: 0 },
    cSide: { kind: "frag-c-side", dx: -6.3, dy: 1.8, w: 12.5, h: 27, rotation: 0 },
    cBottom: { kind: "frag-c-bottom", dx: 1.4, dy: 12, w: 18, h: 18, rotation: 0 },
  };
  const map = {
    A: [
      { kind: "frag-diag-left", dx: -4.9, dy: 0.8, w: 11.5, h: 39, rotation: 0 },
      { kind: "frag-diag-right", dx: 4.9, dy: 0.8, w: 11.5, h: 39, rotation: 0 },
      { kind: "frag-cross", dx: 0, dy: 5.3, w: 15.5, h: 9.5, rotation: 0 },
    ],
    B: [
      { kind: "frag-b-top", dx: 3.1, dy: -9.4, w: 20.5, h: 19.5, rotation: 0 },
      { kind: "frag-b-bottom", dx: 2.9, dy: 9.3, w: 21, h: 20.5, rotation: 0 },
      { kind: "frag-b-stem", dx: -5.7, dy: 0, w: 13.5, h: 39, rotation: 0 },
    ],
    C: [shared.cTop, shared.cSide, shared.cBottom],
    D: [
      { kind: "frag-d-top", dx: 1.4, dy: -8.5, w: 19, h: 22, rotation: 0 },
      { kind: "frag-d-bottom", dx: 1.5, dy: 9.4, w: 19, h: 22, rotation: 0 },
      shared.stem,
    ],
    E: [
      shared.topBar,
      { kind: "frag-double-bar", dx: 0.4, dy: 6.7, w: 15.2, h: 21, rotation: 0 },
      shared.stem,
    ],
    F: [shared.topBar, shared.midBar, shared.stem],
    G: [shared.cTop, shared.cSide, shared.cBottom, { kind: "frag-g-tail", dx: 6.3, dy: 7.2, w: 11.5, h: 9.5, rotation: 0 }],
    H: [shared.leftStem, shared.rightStem, shared.midBar],
    I: [
      { kind: "frag-cap", dx: 0, dy: -15.2, w: 14.5, h: 9.2, rotation: 0 },
      { kind: "frag-cap", dx: 0, dy: 15.2, w: 14.5, h: 9.2, rotation: 180 },
      { kind: "frag-stem", dx: 0, dy: 0, w: 11.2, h: 40, rotation: 0 },
    ],
  };
  return map[letter] || map.A;
}

function startPoint(puzzleIndex, serial) {
  const points = [
    [17, 24],
    [66, 22],
    [42, 84],
    [80, 35],
    [22, 72],
    [54, 21],
    [36, 77],
    [78, 58],
    [31, 35],
    [72, 78],
    [48, 36],
    [20, 52],
    [59, 70],
    [38, 22],
  ];
  const base = points[(serial + puzzleIndex * 3) % points.length];
  const wobble = ((serial + 1) * (puzzleIndex + 3)) % 5;
  return {
    x: clamp(base[0] + wobble - 2, 14, 84),
    y: clamp(base[1] - wobble + 2, 18, 84),
  };
}

function startRotationFor(puzzleIndex, slot, fragmentIndex, targetRotation) {
  const offsets = [74, -63, 118, -96, 43, -132, 57, -48, 101, -78, 34, -111];
  return targetRotation + offsets[(puzzleIndex + slot * 3 + fragmentIndex) % offsets.length];
}

function render() {
  renderProgress();
  if (current >= puzzles.length) renderEnd();
  else renderScene();
}

function renderScene() {
  const puzzleData = puzzles[current];
  const state = states[current];
  const allPlaced = isAllPlaced();
  prevButton.disabled = current === 0;
  hintButton.disabled = false;
  answerButton.disabled = false;
  answerButton.textContent = solved[current] ? "next" : "reveal";
  resetPuzzleButton.disabled = false;

  stage.innerHTML = `
    <section class="scene drag-scene" data-testid="puzzle-${current + 1}" data-room="${current + 1}">
      <div class="room-number">${current + 1}</div>
      <div class="room-title">${puzzleData.name}</div>
      <div class="game-layout">
        <div class="board" data-testid="board" data-revealed="${allPlaced}" aria-label="Puzzle board">
          ${backgroundArt(puzzleData)}
          <div class="target-layer" data-hint-level="${state.hintLevel}" aria-hidden="true">
            ${renderGuideLayer(puzzleData)}
            ${puzzleData.pieces.map((pieceData, index) => renderTargetMark(pieceData, index, state.hintLevel)).join("")}
          </div>
          <div class="letter-reveal" data-revealed="${allPlaced}" data-testid="hidden-code">${puzzleData.code}</div>
          <div class="piece-layer">
            ${puzzleData.pieces.map((pieceData) => renderPiece(pieceData, state.pieces.find((p) => p.id === pieceData.id))).join("")}
          </div>
        </div>
        <aside class="key-panel" aria-label="Letter keypad">
          <div class="entry ${state.wrong ? "is-wrong" : ""}" style="grid-template-columns:repeat(${puzzleData.code.length}, minmax(0, 1fr))" data-testid="entry" aria-label="Entered code">
            ${entryText(state.input, puzzleData.code.length)}
          </div>
          <div class="key-grid">
            ${KEYS.map((letter) => `<button class="key-button" type="button" data-action="key" data-letter="${letter}" data-testid="key-${letter}" aria-label="Enter ${letter}">${letter}</button>`).join("")}
            <button class="key-button clear-button" type="button" data-action="clear" data-testid="key-clear" aria-label="Clear code">x</button>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderProgress() {
  progress.innerHTML = solved
    .map((isSolved, index) => {
      const classes = ["progress-dot"];
      if (isSolved) classes.push("is-solved");
      if (index === current) classes.push("is-current");
      return `<span class="${classes.join(" ")}"></span>`;
    })
    .join("");
}

function renderEnd() {
  renderProgress();
  prevButton.disabled = false;
  hintButton.disabled = true;
  answerButton.disabled = true;
  answerButton.textContent = "reveal";
  resetPuzzleButton.disabled = true;
  stage.innerHTML = `
    <section class="scene drag-scene" data-testid="final-screen">
      <div class="end-panel">
        <div class="end-card">
          ${finishIcon()}
          <h1>all codes found</h1>
          <p>ten layered puzzles are complete.</p>
          <button class="next-button" type="button" data-action="new-game" data-testid="new-game-button" aria-label="New game">&lt;</button>
        </div>
      </div>
    </section>
  `;
}

function renderTargetMark(pieceData, index, hintLevel) {
  const classes = ["target-mark", `target-mark-${index % 5}`];
  if (hintLevel >= 1) classes.push("is-warmed");
  if (hintLevel >= 2) classes.push("is-strong");
  return `
    <div class="${classes.join(" ")}" style="${targetStyle(pieceData)}">
      <span class="target-pip"></span>
      <span class="target-stroke target-stroke-a"></span>
      <span class="target-stroke target-stroke-b"></span>
      ${hintLevel >= 2 ? "<span class=\"target-corner target-corner-a\"></span><span class=\"target-corner target-corner-b\"></span>" : ""}
    </div>
  `;
}

function renderGuideLayer(puzzleData) {
  return "";
}

function renderPiece(pieceData, pieceState) {
  const placed = pieceState.placed ? " is-placed" : "";
  return `
    <button class="piece${placed}" type="button" data-piece-id="${pieceData.id}" data-target-x="${pieceData.targetX}" data-target-y="${pieceData.targetY}" data-z="${pieceData.z}" data-testid="piece-${pieceData.id}" aria-label="Draggable ${pieceData.kind}" style="${pieceStyle(pieceData, pieceState)}">
      ${pieceSvg(pieceData)}
    </button>
  `;
}

function pieceStyle(pieceData, pieceState) {
  const rotation = pieceState.rotation ?? pieceData.rotation;
  return `--x:${pieceState.x}%;--y:${pieceState.y}%;--w:${pieceData.w}%;--h:${pieceData.h}%;--rot:${rotation}deg;--z:${pieceData.z};`;
}

function targetStyle(pieceData) {
  const isFragment = pieceData.kind.startsWith("frag-") || pieceData.kind === "slice";
  const markW = isFragment ? Math.max(4.5, Math.min(9, pieceData.w * 0.48)) : Math.max(8, Math.min(18, pieceData.w * 0.72));
  const markH = isFragment ? Math.max(4.5, Math.min(9, pieceData.h * 0.34)) : Math.max(7, Math.min(18, pieceData.h * 0.68));
  return `--x:${pieceData.targetX}%;--y:${pieceData.targetY}%;--w:${markW}%;--h:${markH}%;--rot:${pieceData.rotation}deg;`;
}

function entryText(input, length) {
  const letters = input.padEnd(length, "_").slice(0, length).split("");
  return letters.map((letter) => `<span>${letter}</span>`).join("");
}

function pressKey(letter) {
  const puzzleData = puzzles[current];
  const state = states[current];
  state.wrong = false;
  state.input = (state.input + letter).slice(0, puzzleData.code.length);
  if (state.input.length === puzzleData.code.length) {
    if (isAcceptedCode(state.input, puzzleData.code)) {
      revealCurrentPuzzle();
      renderScene();
      completeCurrent();
      return;
    }
    state.wrong = true;
    state.input = "";
  }
  renderScene();
}

function isAcceptedCode(input, code) {
  return normalizeCode(input) === normalizeCode(code);
}

function normalizeCode(value) {
  return value.split("").sort().join("");
}

function revealCurrentPuzzle() {
  const state = states[current];
  for (const pieceState of state.pieces) {
    const base = getPiece(pieceState.id);
    pieceState.x = base.targetX;
    pieceState.y = base.targetY;
    pieceState.rotation = base.rotation;
    pieceState.placed = true;
  }
}

function completeCurrent() {
  solved[current] = true;
  answerButton.textContent = current === puzzles.length - 1 ? "finish" : "next";
  renderProgress();
  const scene = stage.querySelector(".scene");
  if (scene?.classList.contains("drag-scene")) return;
  if (!scene?.querySelector("[data-testid='complete-panel']")) {
    scene?.insertAdjacentHTML("beforeend", completeOverlay(current === puzzles.length - 1));
  }
}

function completeOverlay(isLast) {
  return `
    <div class="complete-panel" data-testid="complete-panel">
      <div class="complete-card">
        ${finishIcon()}
        <button class="next-button" type="button" data-action="next" data-testid="next-button" aria-label="${isLast ? "Finish" : "Next puzzle"}">&gt;</button>
      </div>
    </div>
  `;
}

function onPointerDown(event) {
  const pieceEl = event.target.closest("[data-piece-id]");
  if (!pieceEl || current >= puzzles.length) return;
  const board = stage.querySelector(".board");
  const rect = board.getBoundingClientRect();
  const pieceState = states[current].pieces.find((p) => p.id === pieceEl.dataset.pieceId);
  const pointer = pointerPercent(event, rect);
  pieceState.placed = false;
  drag = {
    id: pieceEl.dataset.pieceId,
    pointerId: event.pointerId,
    dx: pointer.x - pieceState.x,
    dy: pointer.y - pieceState.y,
  };
  pieceEl.setPointerCapture(event.pointerId);
  pieceEl.classList.add("is-dragging");
  event.preventDefault();
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const board = stage.querySelector(".board");
  const rect = board.getBoundingClientRect();
  const pointer = pointerPercent(event, rect);
  const pieceState = states[current].pieces.find((p) => p.id === drag.id);
  const pieceData = getPiece(drag.id);
  pieceState.x = clamp(pointer.x - drag.dx, 4, 96);
  pieceState.y = clamp(pointer.y - drag.dy, 4, 96);
  pieceState.placed = false;
  const pieceEl = stage.querySelector(`[data-piece-id="${drag.id}"]`);
  if (pieceEl) pieceEl.setAttribute("style", pieceStyle(pieceData, pieceState));
  updateRevealState();
  event.preventDefault();
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const pieceState = states[current].pieces.find((p) => p.id === drag.id);
  const pieceData = getPiece(drag.id);
  const distance = Math.hypot(pieceState.x - pieceData.targetX, pieceState.y - pieceData.targetY);
  if (distance <= puzzles[current].tolerance) {
    pieceState.x = pieceData.targetX;
    pieceState.y = pieceData.targetY;
    pieceState.rotation = pieceData.rotation;
    pieceState.placed = true;
  }
  const pieceEl = stage.querySelector(`[data-piece-id="${drag.id}"]`);
  if (pieceEl) {
    pieceEl.setAttribute("style", pieceStyle(pieceData, pieceState));
    pieceEl.classList.toggle("is-placed", pieceState.placed);
    pieceEl.classList.remove("is-dragging");
  }
  drag = null;
  updateRevealState();
  event.preventDefault();
}

function updateRevealState() {
  const allPlaced = isAllPlaced();
  const board = stage.querySelector(".board");
  const code = stage.querySelector(".letter-reveal");
  if (board) board.dataset.revealed = String(allPlaced);
  if (code) code.dataset.revealed = String(allPlaced);
}

function isAllPlaced() {
  if (current >= puzzles.length) return false;
  return states[current].pieces.every((pieceState) => pieceState.placed);
}

function getPiece(id) {
  return puzzles[current].pieces.find((pieceData) => pieceData.id === id);
}

function pointerPercent(event, rect) {
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function backgroundArt(puzzleData) {
  return `<svg class="board-art" viewBox="0 0 200 140" aria-hidden="true">
    <path class="paper-bg" d="M7 10 C32 6 58 9 82 7 C115 5 142 9 193 10 L190 132 C155 136 127 131 92 135 C60 138 31 133 8 134 C5 101 8 73 6 45 C5 30 7 19 7 10 Z"></path>
  </svg>`;
}

function pieceSvg(pieceData) {
  const kind = pieceData.kind;
  if (kind === "slice") {
    return slicePieceSvg(pieceData);
  }
  if (kind.startsWith("frag-")) {
    return fragmentPieceSvg(kind);
  }
  const map = {
    smear: `<path class="piece-fill" d="M10 55 C24 19 78 25 92 45 C82 78 26 82 10 55 Z"></path><path class="piece-line" d="M23 54 C39 42 57 60 78 47"></path>`,
    strip: `<path class="piece-fill" d="M40 4 L62 8 L58 96 L33 91 Z"></path><path class="piece-line" d="M44 15 L52 83"></path>`,
    leaf: `<path class="piece-fill" d="M18 67 C29 25 71 13 84 31 C73 72 37 84 18 67 Z"></path><path class="piece-line" d="M28 67 C47 49 61 39 78 30"></path>`,
    receipt: `<path class="piece-fill" d="M14 10 L86 17 L78 90 L18 82 L25 72 L14 61 L25 50 L15 38 L27 27 Z"></path><path class="piece-line" d="M31 30 H69 M28 46 H73 M30 62 H62"></path>`,
    bubble: `<circle class="piece-fill" cx="50" cy="50" r="35"></circle><circle class="piece-cut" cx="37" cy="40" r="8"></circle><circle class="piece-cut" cx="61" cy="58" r="11"></circle>`,
    cloth: `<path class="piece-fill" d="M20 18 L80 12 L86 82 L28 88 Z"></path><path class="piece-line" d="M32 28 C43 43 59 25 72 41 M31 64 C45 53 58 75 73 58"></path>`,
    pin: `<path class="piece-fill" d="M43 8 H57 L62 89 H38 Z"></path><circle class="piece-cut" cx="50" cy="23" r="6"></circle>`,
    ticket: `<path class="piece-fill" d="M16 23 C28 30 28 48 16 55 L21 82 L84 73 L78 16 Z"></path><path class="piece-line" d="M35 31 H67 M36 49 H70 M39 66 H61"></path>`,
    ring: `<circle class="piece-line thick" cx="50" cy="50" r="34"></circle><path class="piece-line" d="M17 52 C31 42 42 66 57 53 C70 42 78 47 84 55"></path>`,
    paper: `<path class="piece-fill" d="M19 21 L77 14 L84 75 L28 87 Z"></path><circle class="piece-cut" cx="38" cy="42" r="9"></circle><circle class="piece-cut" cx="61" cy="56" r="8"></circle>`,
    statue: `<path class="piece-fill" d="M50 11 C61 23 60 41 54 52 L70 83 H30 L45 52 C38 40 39 22 50 11 Z"></path><path class="piece-line" d="M38 83 H72"></path>`,
    shell: `<path class="piece-fill" d="M15 72 C21 32 45 16 50 16 C57 16 80 32 86 72 Z"></path><path class="piece-line" d="M50 18 V72 M33 32 L43 72 M67 32 L57 72 M22 56 H78"></path>`,
    awning: `<path class="piece-fill" d="M12 24 H88 L80 76 C69 87 60 71 50 82 C40 71 31 87 20 76 Z"></path><path class="piece-line" d="M28 25 L24 75 M50 25 V80 M72 25 L76 75"></path>`,
    map: `<path class="piece-fill" d="M15 18 L46 9 L83 22 L72 84 L39 76 L18 86 Z"></path><path class="piece-line" d="M26 45 C39 30 53 59 67 42 M28 65 C43 52 55 77 73 60"></path>`,
  };
  return `<svg class="piece-svg" viewBox="0 0 100 100" aria-hidden="true">${map[kind] || map.paper}</svg>`;
}

function slicePieceSvg(pieceData) {
  return `<svg class="piece-svg slice-svg" viewBox="${pieceData.sliceX} ${pieceData.sliceY} ${pieceData.w} ${pieceData.h}" preserveAspectRatio="none" aria-hidden="true">
    ${solvedImage(pieceData.code, pieceData.variant)}
  </svg>`;
}

function solvedImage(code, variant = 0) {
  const letters = code.split("");
  const centers = [27, 50, 73];
  const text = letters
    .map((letter, index) => solvedLetter(letter, centers[index], 59, variant + index))
    .join("");
  return `<g class="solved-image">${text}</g>`;
}

function solvedLetter(letter, x, y, seed) {
  const glyph = letterGlyph(letter);
  const sway = ((seed % 5) - 2) * 0.55;
  const twigs = decorativeTwigs(letter, x, y, seed);
  const transform = `translate(${x} ${y}) rotate(${sway}) scale(0.78 0.84)`;
  return `<g transform="${transform}">
    ${glyph}
    ${twigs}
  </g>`;
}

function letterGlyph(letter) {
  const common = `class="answer-stroke"`;
  const fine = `class="answer-twig"`;
  const glyphs = {
    A: `<path ${common} d="M -9 18 C -5 3 -2 -10 0 -18 C 3 -9 6 3 10 18"></path><path ${common} d="M -5 5 C -1 3 4 3 8 6"></path><path ${fine} d="M -5 10 C -1 6 3 6 7 11"></path>`,
    B: `<path ${common} d="M -9 -18 C -10 -5 -10 6 -9 18"></path><path ${common} d="M -8 -16 C 7 -20 14 -8 5 0 C 17 4 12 20 -8 15"></path><path ${fine} d="M -5 0 C 2 -2 7 0 10 5"></path>`,
    C: `<path ${common} d="M 11 -13 C 0 -22 -15 -13 -15 1 C -15 17 2 23 12 12"></path><path ${fine} d="M 9 -13 C 4 -10 0 -10 -5 -12"></path><path ${fine} d="M 1 15 C 5 13 9 14 12 17"></path>`,
    D: `<path ${common} d="M -10 -18 C -11 -5 -11 7 -10 18"></path><path ${common} d="M -9 -17 C 14 -16 19 15 -9 17"></path><path ${fine} d="M -7 5 C 0 1 8 3 12 8"></path>`,
    E: `<path ${common} d="M -10 -18 C -11 -4 -11 8 -10 18"></path><path ${common} d="M -8 -16 C 0 -18 7 -18 13 -15"></path><path ${common} d="M -9 0 C -1 -2 5 -2 11 0"></path><path ${common} d="M -9 17 C 0 15 7 16 14 18"></path>`,
    F: `<path ${common} d="M -10 -18 C -11 -4 -11 8 -10 18"></path><path ${common} d="M -8 -16 C 0 -18 7 -18 13 -15"></path><path ${common} d="M -9 0 C -1 -2 5 -2 11 0"></path>`,
    G: `<path ${common} d="M 11 -13 C 0 -22 -15 -13 -15 1 C -15 17 2 23 12 12 C 12 6 8 3 2 3"></path><path ${common} d="M 1 3 C 7 2 12 3 16 6"></path>`,
    H: `<path ${common} d="M -11 -18 C -12 -5 -12 7 -11 18"></path><path ${common} d="M 11 -18 C 10 -5 10 7 11 18"></path><path ${common} d="M -10 1 C -2 -1 4 -1 11 1"></path>`,
    I: `<path ${common} d="M 0 -18 C -1 -5 -1 7 0 18"></path><path ${common} d="M -8 -17 C -3 -19 4 -19 9 -17"></path><path ${common} d="M -8 18 C -3 20 4 20 9 18"></path>`,
  };
  return glyphs[letter] || glyphs.A;
}

function decorativeTwigs(letter, x, y, seed) {
  const side = seed % 2 === 0 ? 1 : -1;
  const leafX = side * (letter === "I" ? 4 : 9);
  const leafY = -17 + (seed % 3) * 3;
  return `<path class="answer-twig" d="M ${leafX * 0.55} ${leafY + 5} C ${leafX} ${leafY + 2} ${leafX + side * 4} ${leafY + 3} ${leafX + side * 6} ${leafY + 7}"></path>
    <path class="answer-leaf" d="M ${leafX + side * 5} ${leafY + 6} C ${leafX + side * 5} ${leafY - 1} ${leafX + side * 13} ${leafY - 2} ${leafX + side * 15} ${leafY + 4} C ${leafX + side * 11} ${leafY + 10} ${leafX + side * 7} ${leafY + 10} ${leafX + side * 5} ${leafY + 6} Z"></path>`;
}

function fragmentPieceSvg(kind) {
  const paths = {
    "frag-stem": `<path class="fragment-stroke" d="M50 5 C48 28 52 47 49 67 C47 81 49 91 52 97"></path><path class="fragment-side" d="M50 29 C39 28 33 35 31 45 M49 66 C59 65 66 71 69 82"></path>`,
    "frag-diag-left": `<path class="fragment-stroke" d="M78 7 C56 30 43 58 21 93"></path><path class="fragment-side" d="M51 39 C42 37 36 43 33 51 M33 74 C42 73 48 78 51 86"></path>`,
    "frag-diag-right": `<path class="fragment-stroke" d="M22 7 C44 30 57 58 79 93"></path><path class="fragment-side" d="M49 39 C58 37 64 43 67 51 M67 74 C58 73 52 78 49 86"></path>`,
    "frag-cross": `<path class="fragment-stroke" d="M14 53 C34 46 62 48 86 54"></path><path class="fragment-node" d="M44 51 C47 45 56 45 59 52 C55 57 48 57 44 51 Z"></path>`,
    "frag-bar": `<path class="fragment-stroke" d="M10 49 C31 41 65 43 90 51"></path><path class="fragment-side" d="M45 47 C50 39 59 38 66 45"></path>`,
    "frag-double-bar": `<path class="fragment-stroke" d="M10 27 C31 20 65 22 90 29 M12 73 C34 66 65 68 88 75"></path><path class="fragment-side" d="M47 26 C53 34 59 35 66 30"></path>`,
    "frag-cap": `<path class="fragment-stroke" d="M13 50 C31 42 68 42 87 50"></path><path class="fragment-node" d="M38 50 C42 42 55 42 59 50 C54 58 43 58 38 50 Z"></path>`,
    "frag-b-stem": `<path class="fragment-stroke" d="M50 6 C48 27 49 72 51 94"></path><path class="fragment-side" d="M50 21 C62 19 70 23 77 31 M50 52 C63 49 71 54 77 62 M51 84 C62 83 70 78 77 70"></path>`,
    "frag-b-top": `<path class="fragment-stroke" d="M10 70 C13 39 35 18 62 20 C91 23 96 55 70 68 C51 78 31 72 10 70"></path><path class="fragment-side" d="M29 45 C44 41 60 43 74 51"></path>`,
    "frag-b-bottom": `<path class="fragment-stroke" d="M10 30 C33 26 58 28 74 42 C94 59 83 88 56 88 C34 89 18 79 10 67"></path><path class="fragment-side" d="M29 73 C43 78 59 77 73 68"></path>`,
    "frag-c-top": `<path class="fragment-stroke" d="M88 38 C65 11 26 17 13 52"></path><path class="fragment-side" d="M69 26 C63 35 55 38 44 36"></path>`,
    "frag-c-side": `<path class="fragment-stroke" d="M64 8 C27 25 25 74 62 92"></path><path class="fragment-side" d="M38 45 C30 51 30 60 38 66"></path>`,
    "frag-c-bottom": `<path class="fragment-stroke" d="M14 48 C26 83 66 89 88 62"></path><path class="fragment-side" d="M47 66 C58 64 66 67 72 75"></path>`,
    "frag-d-arc": `<path class="fragment-stroke" d="M15 14 C55 4 91 28 91 52 C91 78 56 97 15 84"></path><path class="fragment-side" d="M63 22 C75 34 79 49 75 63"></path>`,
    "frag-d-top": `<path class="fragment-stroke" d="M13 21 C43 9 77 24 86 55"></path><path class="fragment-side" d="M53 21 C65 29 72 39 73 51"></path>`,
    "frag-d-bottom": `<path class="fragment-stroke" d="M86 50 C80 80 45 96 13 80"></path><path class="fragment-side" d="M69 69 C57 78 44 81 30 78"></path>`,
    "frag-g-tail": `<path class="fragment-stroke" d="M10 45 C29 39 57 43 88 55"></path><path class="fragment-side" d="M61 52 C66 63 76 67 88 65"></path>`,
  };
  return `<svg class="piece-svg fragment-piece" viewBox="0 0 100 100" aria-hidden="true">
    ${paths[kind] || paths["frag-stem"]}
  </svg>`;
}

function finishIcon() {
  return `<svg class="line-icon" viewBox="0 0 100 100" aria-hidden="true">
    <path class="stroke" d="M17 66 C36 36 64 36 83 66"></path>
    <path class="stroke" d="M28 66 V83 H72 V66"></path>
    <path class="stroke" d="M39 74 H61"></path>
    <circle class="fill" cx="50" cy="46" r="7"></circle>
  </svg>`;
}

render();
