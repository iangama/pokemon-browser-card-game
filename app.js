const POLL_MS = 1200;
const AUTH_KEY = "pokemon_online_auth_v1";

const el = {
  playerNameInput: document.getElementById("playerNameInput"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  connectionInfo: document.getElementById("connectionInfo"),
  statusText: document.getElementById("statusText"),
  turnText: document.getElementById("turnText"),
  turnBanner: document.getElementById("turnBanner"),
  winnerText: document.getElementById("winnerText"),
  scoreboard: document.getElementById("scoreboard"),
  newGameBtn: document.getElementById("newGameBtn"),
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
  battleLog: document.getElementById("battleLog")
};

const state = {
  connection: null,
  snapshot: null,
  pollId: null
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

  if (!response.ok) {
    throw new Error(body.error || `Erro HTTP ${response.status}`);
  }

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
    if (!raw) return;
    state.connection = JSON.parse(raw);
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
  el.player1Active.innerHTML = "";
  el.player2Active.innerHTML = "";
  el.player1Hand.innerHTML = "";
  el.player2Hand.innerHTML = "";
  el.attackOptions.innerHTML = "";
  el.battleLog.innerHTML = "";
}

function renderCard(card, opts = {}) {
  const { active = false, hidden = false, owner = "player1" } = opts;
  const article = document.createElement("article");

  if (hidden) {
    article.className = "card-hidden";
    article.textContent = "Carta oculta";
    return article;
  }

  article.className = `card type-${normalizeType(card.types?.[0])} ${active ? "active" : ""}`.trim();
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
  container.appendChild(renderCard(player.activeCard, { active: true, owner: role }));
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
  el.scoreboard.innerHTML = `
    <div class="score-item">
      <strong>${p1.name}</strong><br/>
      Deck: ${p1.deckCount} | Mão: ${p1.handCount} | Descarte: ${p1.discardCount}<br/>
      Energia Pool: ${p1.energyPool} | KOs: ${p1.knockouts}
    </div>
    <div class="score-item">
      <strong>${p2.name}</strong><br/>
      Deck: ${p2.deckCount} | Mão: ${p2.handCount} | Descarte: ${p2.discardCount}<br/>
      Energia Pool: ${p2.energyPool} | KOs: ${p2.knockouts}
    </div>
  `;
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
  const disabledByTurn = !connected || !mine || Boolean(state.snapshot?.winner);

  el.newGameBtn.disabled = !connected || state.connection.role !== "player1";
  el.attachEnergyBtn.disabled = disabledByTurn;
  el.attackBtn.disabled = disabledByTurn;
  el.endTurnBtn.disabled = disabledByTurn;

  el.energyInfo.textContent = `Energia no pool: ${me?.energyPool ?? "-"}`;
  el.turnLockInfo.textContent = mine ? "Ações liberadas para você." : "Ações bloqueadas: aguarde seu turno.";

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
  renderActive("player1", el.player1Active);
  renderActive("player2", el.player2Active);
  renderHand("player1", el.player1Hand);
  renderHand("player2", el.player2Hand);
  renderAttackOptions();
  renderLogs();
  renderTurnSignal();
  renderControls();
}

async function refreshState() {
  if (!state.connection) return;
  try {
    const query = new URLSearchParams({
      code: state.connection.code,
      token: state.connection.token
    });
    const data = await apiFetch(`/api/session/state?${query.toString()}`);
    state.snapshot = data;
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

function bindEvents() {
  el.createRoomBtn.addEventListener("click", createRoom);
  el.joinRoomBtn.addEventListener("click", joinRoom);
  el.newGameBtn.addEventListener("click", startMatch);
  el.attachEnergyBtn.addEventListener("click", () => sendAction("ATTACH_ENERGY"));
  el.attackBtn.addEventListener("click", () => sendAction("ATTACK"));
  el.endTurnBtn.addEventListener("click", () => sendAction("END_TURN"));
  el.player1Hand.addEventListener("click", onHandClick);
  el.player2Hand.addEventListener("click", onHandClick);
  el.attackOptions.addEventListener("click", onAttackClick);
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
