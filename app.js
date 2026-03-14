const POLL_MS = 1200;
const AUTH_KEY = "pokemon_online_auth_v1";

const el = {
  playerNameInput: document.getElementById("playerNameInput"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  leaveRoomBtn: document.getElementById("leaveRoomBtn"),
  connectionInfo: document.getElementById("connectionInfo"),
  deckOptions: document.getElementById("deckOptions"),
  deckPreview: document.getElementById("deckPreview"),
  deckStatus: document.getElementById("deckStatus"),
  evolutionRuleToggle: document.getElementById("evolutionRuleToggle"),
  statusText: document.getElementById("statusText"),
  turnText: document.getElementById("turnText"),
  turnBanner: document.getElementById("turnBanner"),
  winnerText: document.getElementById("winnerText"),
  rematchBtn: document.getElementById("rematchBtn"),
  scoreboard: document.getElementById("scoreboard"),
  newGameBtn: document.getElementById("newGameBtn"),
  evolveBtn: document.getElementById("evolveBtn"),
  attachEnergyBtn: document.getElementById("attachEnergyBtn"),
  attackBtn: document.getElementById("attackBtn"),
  endTurnBtn: document.getElementById("endTurnBtn"),
  energyInfo: document.getElementById("energyInfo"),
  turnLockInfo: document.getElementById("turnLockInfo"),
  attackOptions: document.getElementById("attackOptions"),
  player1Panel: document.getElementById("player1Panel"),
  player2Panel: document.getElementById("player2Panel"),
  player1Active: document.getElementById("player1Active"),
  player2Active: document.getElementById("player2Active"),
  player1Hand: document.getElementById("player1Hand"),
  player2Hand: document.getElementById("player2Hand"),
  battleLog: document.getElementById("battleLog"),
  chatList: document.getElementById("chatList"),
  typingIndicator: document.getElementById("typingIndicator"),
  chatInput: document.getElementById("chatInput"),
  sendChatBtn: document.getElementById("sendChatBtn")
};

const state = {
  connection: null,
  snapshot: null,
  prevSnapshot: null,
  pollId: null,
  typingLocal: false,
  typingTimer: null,
  lastChatHead: "",
  audioReady: false,
  audioCtx: null,
  evolveFlash: {
    player1: false,
    player2: false
  }
};

function normalizeType(type) {
  if (!type) return "colorless";
  return String(type).toLowerCase();
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseDamage(value) {
  if (typeof value === "number") return value;
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }

  if (!response.ok) throw new Error(body.error || `Erro HTTP ${response.status}`);
  return body;
}

function saveConnection() {
  if (!state.connection) {
    localStorage.removeItem(AUTH_KEY);
    return;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(state.connection));
}

function loadConnection() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) state.connection = JSON.parse(raw);
  } catch {
    state.connection = null;
  }
}

function isMyTurn() {
  if (!state.snapshot || !state.connection) return false;
  return state.snapshot.currentPlayer === state.connection.role;
}

function myPlayer() {
  if (!state.snapshot || !state.connection) return null;
  return state.snapshot.players[state.connection.role] || null;
}

function opponentRole() {
  if (!state.connection) return "player2";
  return state.connection.role === "player1" ? "player2" : "player1";
}

function updateConnectionInfo() {
  if (!state.connection) {
    el.connectionInfo.textContent = "Sem conexão de sala.";
    return;
  }
  const roleLabel = state.connection.role === "player1" ? "Jogador 1" : "Jogador 2";
  el.connectionInfo.textContent = `Conectado como ${roleLabel} | Sala: ${state.connection.code}`;
}

function clearBoard() {
  el.scoreboard.innerHTML = "";
  el.deckOptions.innerHTML = "";
  el.deckPreview.innerHTML = "";
  el.player1Active.innerHTML = "";
  el.player2Active.innerHTML = "";
  el.player1Hand.innerHTML = "";
  el.player2Hand.innerHTML = "";
  el.attackOptions.innerHTML = "";
  el.battleLog.innerHTML = "";
  el.chatList.innerHTML = "";
  el.typingIndicator.textContent = "";
  el.rematchBtn.hidden = true;
}

function leaveRoom() {
  if (state.pollId) {
    clearInterval(state.pollId);
    state.pollId = null;
  }
  state.connection = null;
  state.snapshot = null;
  state.prevSnapshot = null;
  state.lastChatHead = "";
  saveConnection();
  render();
}

function ensureAudioContext() {
  if (state.audioReady) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    state.audioCtx = new AudioCtx();
    state.audioReady = true;
  } catch {
    state.audioReady = false;
  }
}

function playMessageBeep() {
  if (!state.audioReady || !state.audioCtx) return;
  const ctx = state.audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.start(now);
  osc.stop(now + 0.2);
}

function canNotify() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

async function ensureNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // ignore
    }
  }
}

function maybeNotifyIncomingMessage() {
  const messages = state.snapshot?.chat || [];
  const head = messages[0] || "";
  if (!head) return;

  if (!state.lastChatHead) {
    state.lastChatHead = head;
    return;
  }

  if (head === state.lastChatHead) return;

  const myName = state.snapshot?.players?.[state.connection?.role || ""]?.name || "";
  const isMine = myName && head.includes(`${myName}:`);
  if (!isMine) {
    playMessageBeep();
    if (canNotify()) {
      try {
        new Notification("Nova mensagem na sala", { body: head });
      } catch {
        // ignore
      }
    }
  }

  state.lastChatHead = head;
}

function renderCard(card, opts = {}) {
  const { active = false, hidden = false, owner = "player1", evolveFlash = false } = opts;
  const article = document.createElement("article");

  if (hidden) {
    article.className = "card-hidden";
    article.textContent = "Carta oculta";
    return article;
  }

  article.className = `card type-${normalizeType(card.types?.[0])} ${active ? "active" : ""}`.trim();
  if (evolveFlash) article.classList.add("evolve-flash");
  article.setAttribute("data-owner", owner);
  article.setAttribute("data-card-uid", card.uid);

  const energyByType = Object.entries(card.energyAttached?.byType || {})
    .map(([type, amount]) => `${capitalize(type)}:${amount}`)
    .join(", ") || "-";

  const attacks = (card.attacks || []).slice(0, 2).map((attack) => {
    const cost = (attack.cost || []).map(capitalize).join("/") || "-";
    return `<li>${attack.name} (${parseDamage(attack.damage)}) [${cost}]</li>`;
  }).join("");

  article.innerHTML = `
    <img src="${card.image}" alt="${card.name}" loading="lazy" />
    <h4>${card.name}</h4>
    <ul class="meta">
      <li><strong>Tipo:</strong> ${(card.types || []).map(capitalize).join(", ")}</li>
      <li><strong>HP:</strong> ${card.currentHp}/${card.hp}</li>
      <li><strong>Atk:</strong> ${card.attack} | <strong>Def:</strong> ${card.defense} | <strong>Vel:</strong> ${card.speed}</li>
      <li><strong>Energia:</strong> ${card.energyAttached?.total || 0} (${energyByType})</li>
      <li><strong>Evolui de:</strong> ${card.evolvesFrom || "-"}</li>
      <li><strong>Evolui para:</strong> ${card.evolvesTo || "-"}</li>
    </ul>
    <ul class="attacks">${attacks || "<li>Sem ataques</li>"}</ul>
  `;

  return article;
}

function renderActive(role, container) {
  const player = state.snapshot?.players?.[role];
  container.innerHTML = "";
  if (!player || !player.activeCard) {
    container.innerHTML = "<p>Sem carta ativa.</p>";
    return;
  }
  container.appendChild(renderCard(player.activeCard, {
    active: true,
    owner: role,
    evolveFlash: state.evolveFlash[role]
  }));
}

function renderHand(role, container) {
  const player = state.snapshot?.players?.[role];
  container.innerHTML = "";
  if (!player) return;

  if (player.hand && player.hand.length > 0) {
    for (const card of player.hand) {
      container.appendChild(renderCard(card, { active: card.uid === player.activeCardId, owner: role }));
    }
  } else if (player.hiddenHandCount > 0) {
    for (let i = 0; i < player.hiddenHandCount; i += 1) {
      container.appendChild(renderCard(null, { hidden: true }));
    }
  } else {
    const p = document.createElement("p");
    p.textContent = "Mão vazia.";
    container.appendChild(p);
  }
}

function renderScoreboard() {
  const p1 = state.snapshot.players.player1;
  const p2 = state.snapshot.players.player2;
  const rank = state.snapshot.ranking || { player1Wins: 0, player2Wins: 0, draws: 0 };
  el.scoreboard.innerHTML = `
    <div class="score-item">
      <strong>${p1.name}</strong><br/>
      Deck: ${p1.deckCount} | Mão: ${p1.handCount} | Descarte: ${p1.discardCount}<br/>
      Energia Pool: ${p1.energyPool} | KOs: ${p1.knockouts}<br/>
      Ranking da Sala: ${rank.player1Wins} vitória(s)
    </div>
    <div class="score-item">
      <strong>${p2.name}</strong><br/>
      Deck: ${p2.deckCount} | Mão: ${p2.handCount} | Descarte: ${p2.discardCount}<br/>
      Energia Pool: ${p2.energyPool} | KOs: ${p2.knockouts}<br/>
      Ranking da Sala: ${rank.player2Wins} vitória(s)
    </div>
    <div class="score-item score-draws">
      <strong>Empates na Sala:</strong> ${rank.draws}
    </div>
  `;
}

function renderDeckSelection() {
  const ds = state.snapshot?.deckSelection;
  if (!ds) {
    el.deckOptions.innerHTML = "";
    el.deckPreview.innerHTML = "";
    el.deckStatus.textContent = "Sem dados de deck.";
    return;
  }

  el.deckOptions.innerHTML = "";
  for (const deck of ds.options || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `deck-option ${deck.id === ds.selected ? "selected" : ""}`.trim();
    btn.setAttribute("data-deck-id", deck.id);
    btn.innerHTML = `<strong>${deck.label}</strong><br/><small>ID: ${deck.id}</small>`;
    el.deckOptions.appendChild(btn);
  }

  const selectedDeck = (ds.options || []).find((opt) => opt.id === ds.selected) || (ds.options || [])[0] || null;
  el.deckPreview.innerHTML = "";
  if (selectedDeck) {
    for (const card of selectedDeck.preview || []) {
      const item = document.createElement("article");
      item.className = "deck-preview-card";
      item.innerHTML = `
        <img src="${card.image}" alt="${card.name}" loading="lazy" />
        <strong>${card.name}</strong>
        <small>Tipo: ${capitalize(card.type)}</small>
        <small>Evolui de: ${card.evolvesFrom || "-"}</small>
        <small>Evolui para: ${card.evolvesTo || "-"}</small>
      `;
      el.deckPreview.appendChild(item);
    }
  }

  const myReady = ds.myDeckReady ? "você já escolheu seu deck" : "você ainda não escolheu seu deck";
  const oppReady = ds.opponentDeckReady ? "oponente pronto" : "oponente ainda escolhendo";
  el.deckStatus.textContent = `${myReady}; ${oppReady}.`;
}

function renderAttackOptions() {
  const me = myPlayer();
  el.attackOptions.innerHTML = "";

  if (!me || !me.activeCard) {
    el.attackOptions.innerHTML = "<p>Sem carta ativa.</p>";
    return;
  }

  me.activeCard.attacks.forEach((attack, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `attack-option ${index === me.selectedAttackIndex ? "selected" : ""}`.trim();
    btn.setAttribute("data-attack-index", String(index));
    const cost = (attack.cost || []).map(capitalize).join(", ") || "Sem custo";
    btn.innerHTML = `<strong>${attack.name}</strong><br/>Dano base: ${parseDamage(attack.damage)} | Custo: ${cost}`;
    el.attackOptions.appendChild(btn);
  });
}

function renderLogs() {
  el.battleLog.innerHTML = "";
  const logs = state.snapshot?.logs || [];
  for (const line of logs) {
    const li = document.createElement("li");
    li.textContent = line;
    el.battleLog.appendChild(li);
  }
}

function renderChat() {
  el.chatList.innerHTML = "";
  const messages = state.snapshot?.chat || [];
  for (const msg of messages) {
    const li = document.createElement("li");
    li.textContent = msg;
    el.chatList.appendChild(li);
  }

  const typing = state.snapshot?.typing || {};
  const opponent = opponentRole();
  const oppTyping = Boolean(typing[opponent]);
  const oppName = state.snapshot?.players?.[opponent]?.name || "Oponente";
  el.typingIndicator.textContent = oppTyping ? `${oppName} está digitando...` : "";
}

function renderTurnSignal() {
  const snap = state.snapshot;
  const conn = state.connection;
  if (!snap || !conn) return;

  const turnPlayer = snap.players[snap.currentPlayer];
  const mine = isMyTurn();
  el.turnText.textContent = `Turno atual: ${turnPlayer?.name || "-"} (rodada ${snap.turnNumber})`;

  if (snap.winner) {
    el.turnBanner.className = "turn-banner";
    el.turnBanner.textContent = "Partida encerrada.";
    return;
  }

  if (mine) {
    el.turnBanner.className = "turn-banner mine";
    el.turnBanner.textContent = "SEU TURNO AGORA";
  } else {
    el.turnBanner.className = "turn-banner enemy";
    el.turnBanner.textContent = `AGUARDE: turno de ${turnPlayer?.name || "oponente"}`;
  }
}

function renderControls() {
  const connected = Boolean(state.connection && state.snapshot);
  const mine = isMyTurn();
  const me = myPlayer();
  const disabledByTurn = !connected || !state.snapshot?.ready || !mine || Boolean(state.snapshot?.winner);
  const deckSel = state.snapshot?.deckSelection || {};
  const bothDecksReady = Boolean(deckSel.myDeckReady && deckSel.opponentDeckReady);

  el.newGameBtn.disabled = !connected || state.connection.role !== "player1" || !bothDecksReady;
  el.evolveBtn.disabled = disabledByTurn || !(state.snapshot?.settings?.evolutionEnabled ?? true);
  el.attachEnergyBtn.disabled = disabledByTurn;
  el.attackBtn.disabled = disabledByTurn;
  el.endTurnBtn.disabled = disabledByTurn;

  el.deckOptions.querySelectorAll("button").forEach((btn) => {
    btn.disabled = Boolean(state.snapshot?.winner);
  });

  el.evolutionRuleToggle.disabled = !connected || state.connection.role !== "player1";
  el.evolutionRuleToggle.checked = Boolean(state.snapshot?.settings?.evolutionEnabled ?? true);

  el.energyInfo.textContent = `Energia no pool: ${me?.energyPool ?? "-"}`;
  el.turnLockInfo.textContent = mine ? "Ações liberadas para você." : "Ações bloqueadas: aguarde seu turno.";

  const rematchVotes = state.snapshot?.rematchVotes || { player1: false, player2: false };
  const votesCount = Number(rematchVotes.player1) + Number(rematchVotes.player2);
  const ended = Boolean(state.snapshot?.winner);
  el.rematchBtn.hidden = !ended;
  el.rematchBtn.disabled = !ended || Boolean(rematchVotes[state.connection?.role || ""]);
  if (ended) {
    el.rematchBtn.textContent = `Pedir Revanche (${votesCount}/2 pronto)`;
  }

  el.player1Panel.classList.toggle("current", state.snapshot?.currentPlayer === "player1");
  el.player2Panel.classList.toggle("current", state.snapshot?.currentPlayer === "player2");
}

function render() {
  updateConnectionInfo();

  if (!state.snapshot) {
    clearBoard();
    renderControls();
    return;
  }

  el.statusText.textContent = state.snapshot.ready
    ? "Sala conectada."
    : "Aguardando o segundo jogador entrar na sala.";

  if (state.snapshot.winner) {
    const winnerName = state.snapshot.players[state.snapshot.winner]?.name;
    el.winnerText.textContent = winnerName ? `Vencedor: ${winnerName}` : "Partida encerrada.";
  } else {
    el.winnerText.textContent = "";
  }

  renderScoreboard();
  renderDeckSelection();
  renderActive("player1", el.player1Active);
  renderActive("player2", el.player2Active);
  renderHand("player1", el.player1Hand);
  renderHand("player2", el.player2Hand);
  renderAttackOptions();
  renderLogs();
  renderChat();
  renderTurnSignal();
  renderControls();
}

function triggerEvolveFlash(role) {
  state.evolveFlash[role] = true;
  setTimeout(() => {
    state.evolveFlash[role] = false;
    render();
  }, 900);
}

function detectEvolutionAnimation(prevSnap, nextSnap) {
  if (!prevSnap || !nextSnap) return;
  for (const role of ["player1", "player2"]) {
    const prevActive = prevSnap.players?.[role]?.activeCard;
    const nextActive = nextSnap.players?.[role]?.activeCard;
    if (!prevActive || !nextActive) continue;

    const sameSlot = prevActive.uid === nextActive.uid;
    const changedName = prevActive.name !== nextActive.name;
    if (sameSlot && changedName) {
      triggerEvolveFlash(role);
    }
  }
}

async function refreshState() {
  if (!state.connection) return;
  try {
    const query = new URLSearchParams({
      code: state.connection.code,
      token: state.connection.token
    });
    const data = await apiFetch(`/api/session/state?${query.toString()}`);
    state.prevSnapshot = state.snapshot ? JSON.parse(JSON.stringify(state.snapshot)) : null;
    state.snapshot = data;
    detectEvolutionAnimation(state.prevSnapshot, state.snapshot);
    maybeNotifyIncomingMessage();
    render();
  } catch (error) {
    el.statusText.textContent = error.message;
  }
}

function startPolling() {
  if (state.pollId) clearInterval(state.pollId);
  state.pollId = setInterval(refreshState, POLL_MS);
}

async function createRoom() {
  const name = (el.playerNameInput.value || "Jogador 1").trim();
  if (state.connection) leaveRoom();
  ensureAudioContext();
  await ensureNotificationPermission();
  try {
    const data = await apiFetch("/api/session/create", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    state.connection = {
      code: data.code,
      token: data.token,
      role: data.role,
      name
    };
    el.roomCodeInput.value = data.code;
    saveConnection();
    startPolling();
    await refreshState();
  } catch (error) {
    el.statusText.textContent = error.message;
  }
}

async function joinRoom() {
  const name = (el.playerNameInput.value || "Jogador 2").trim();
  if (state.connection) leaveRoom();
  ensureAudioContext();
  await ensureNotificationPermission();
  const code = (el.roomCodeInput.value || "").trim().toUpperCase();
  if (!code) {
    el.statusText.textContent = "Informe o código da sala.";
    return;
  }

  try {
    const data = await apiFetch("/api/session/join", {
      method: "POST",
      body: JSON.stringify({ code, name })
    });
    state.connection = {
      code: data.code,
      token: data.token,
      role: data.role,
      name
    };
    saveConnection();
    startPolling();
    await refreshState();
  } catch (error) {
    el.statusText.textContent = error.message;
  }
}

async function sendAction(action, payload = {}) {
  if (!state.connection) return;
  try {
    await apiFetch("/api/session/action", {
      method: "POST",
      body: JSON.stringify({
        code: state.connection.code,
        token: state.connection.token,
        action,
        payload
      })
    });
    await refreshState();
  } catch (error) {
    el.statusText.textContent = error.message;
  }
}

async function startMatch() {
  if (!state.connection) return;
  try {
    await apiFetch("/api/session/new-game", {
      method: "POST",
      body: JSON.stringify({
        code: state.connection.code,
        token: state.connection.token
      })
    });
    await refreshState();
  } catch (error) {
    el.statusText.textContent = error.message;
  }
}

function onHandClick(event) {
  const cardEl = event.target.closest("[data-card-uid]");
  if (!cardEl || !state.connection || !state.snapshot) return;
  const owner = cardEl.getAttribute("data-owner");
  const uid = cardEl.getAttribute("data-card-uid");
  if (owner !== state.connection.role) return;
  sendAction("SELECT_ACTIVE", { uid });
}

function onAttackClick(event) {
  const option = event.target.closest(".attack-option");
  if (!option) return;
  const attackIndex = Number(option.getAttribute("data-attack-index"));
  if (!Number.isFinite(attackIndex)) return;
  sendAction("SELECT_ATTACK", { attackIndex });
}

function onDeckSelectClick(event) {
  const btn = event.target.closest("[data-deck-id]");
  if (!btn) return;
  const deckId = btn.getAttribute("data-deck-id");
  if (!deckId) return;
  sendAction("SELECT_DECK", { deckId });
}

function sendChatMessage() {
  const text = (el.chatInput.value || "").trim();
  if (!text) return;
  sendAction("CHAT", { text });
  setTyping(false);
  el.chatInput.value = "";
}

function setTyping(value) {
  if (!state.connection) return;
  if (state.typingLocal === value) return;
  state.typingLocal = value;
  sendAction("CHAT_TYPING", { typing: value });
}

function onChatInputChange() {
  const text = (el.chatInput.value || "").trim();
  if (!text) {
    setTyping(false);
    return;
  }
  setTyping(true);
  if (state.typingTimer) clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => setTyping(false), 1500);
}

function bindEvents() {
  el.createRoomBtn.addEventListener("click", createRoom);
  el.joinRoomBtn.addEventListener("click", joinRoom);
  el.leaveRoomBtn.addEventListener("click", leaveRoom);
  el.newGameBtn.addEventListener("click", startMatch);
  el.evolveBtn.addEventListener("click", () => sendAction("EVOLVE_ACTIVE"));
  el.attachEnergyBtn.addEventListener("click", () => sendAction("ATTACH_ENERGY"));
  el.attackBtn.addEventListener("click", () => sendAction("ATTACK"));
  el.endTurnBtn.addEventListener("click", () => sendAction("END_TURN"));
  el.player1Hand.addEventListener("click", onHandClick);
  el.player2Hand.addEventListener("click", onHandClick);
  el.attackOptions.addEventListener("click", onAttackClick);
  el.deckOptions.addEventListener("click", onDeckSelectClick);
  el.sendChatBtn.addEventListener("click", sendChatMessage);
  el.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChatMessage();
  });
  el.chatInput.addEventListener("input", onChatInputChange);
  el.rematchBtn.addEventListener("click", () => sendAction("REMATCH"));
  el.evolutionRuleToggle.addEventListener("change", () => {
    if (!state.connection || state.connection.role !== "player1") return;
    sendAction("TOGGLE_EVOLUTION_RULE", { enabled: el.evolutionRuleToggle.checked });
  });
}

async function bootstrap() {
  bindEvents();
  loadConnection();
  if (state.connection) {
    el.roomCodeInput.value = state.connection.code;
    startPolling();
    await refreshState();
  }
  render();
}

bootstrap();
