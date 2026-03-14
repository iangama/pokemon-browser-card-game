const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const sessions = new Map();

function randomCode(size = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < size; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseDamage(value) {
  if (typeof value === "number") return value;
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function normalizeType(type) {
  if (!type) return "colorless";
  const map = {
    lightning: "electric",
    metal: "steel",
    darkness: "dark"
  };
  const t = String(type).toLowerCase();
  return map[t] || t;
}

const TYPE_ADVANTAGE = {
  water: ["fire"],
  fire: ["grass"],
  grass: ["water"],
  electric: ["water"]
};

function isTypeAdvantage(attackerType, defenderType) {
  const atk = normalizeType(attackerType);
  const def = normalizeType(defenderType);
  return TYPE_ADVANTAGE[atk]?.includes(def) || false;
}

function emergencyTemplates(total = 16) {
  const base = [
    { dex: 25, name: "Pikachu", type: "electric" },
    { dex: 6, name: "Charizard", type: "fire" },
    { dex: 9, name: "Blastoise", type: "water" },
    { dex: 3, name: "Venusaur", type: "grass" },
    { dex: 94, name: "Gengar", type: "psychic" },
    { dex: 149, name: "Dragonite", type: "dragon" },
    { dex: 143, name: "Snorlax", type: "colorless" },
    { dex: 68, name: "Machamp", type: "fighting" }
  ];

  const out = [];
  for (let i = 0; i < total; i += 1) {
    const b = base[i % base.length];
    const hp = 70 + (i % 5) * 15;
    const attack = 35 + (i % 4) * 10;
    const defense = 28 + (i % 4) * 8;
    const speed = 22 + (i % 4) * 7;
    out.push({
      id: `emergency-${i + 1}`,
      name: b.name,
      image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${b.dex}.png`,
      types: [b.type],
      hp,
      attack,
      defense,
      speed,
      attacks: [
        { name: "Investida", damage: 30, cost: ["Colorless"] },
        { name: "Golpe Elemental", damage: 55, cost: [b.type, "Colorless"] }
      ]
    });
  }
  return out;
}

function instantiateCard(template, uid) {
  return {
    ...clone(template),
    uid,
    currentHp: template.hp,
    energyAttached: { total: 0, byType: {} }
  };
}

function makeEmptyPlayer(name) {
  return {
    name,
    deck: [],
    hand: [],
    discard: [],
    activeCardId: null,
    selectedAttackIndex: 0,
    energyPool: 0,
    hasAttackedThisTurn: false,
    knockouts: 0
  };
}

function drawCards(game, role, amount) {
  const player = game.players[role];
  let drawn = 0;
  while (drawn < amount && player.deck.length > 0) {
    player.hand.push(player.deck.pop());
    drawn += 1;
  }
  return drawn;
}

function getActive(player) {
  return player.hand.find((card) => card.uid === player.activeCardId) || null;
}

function ensureActive(game, role) {
  const player = game.players[role];
  if (getActive(player)) return;
  player.activeCardId = player.hand.length > 0 ? player.hand[0].uid : null;
}

function removeDefeatedActive(game, role) {
  const player = game.players[role];
  const active = getActive(player);
  if (!active || active.currentHp > 0) return false;
  const idx = player.hand.findIndex((card) => card.uid === active.uid);
  if (idx >= 0) {
    const [card] = player.hand.splice(idx, 1);
    player.discard.push(card);
  }
  player.activeCardId = null;
  ensureActive(game, role);
  return true;
}

function attackCost(attack) {
  return (attack.cost || []).map(normalizeType);
}

function canUseAttack(card, attack) {
  const costs = attackCost(attack);
  if (card.energyAttached.total < costs.length) return false;

  const req = {};
  for (const type of costs) {
    if (type === "colorless") continue;
    req[type] = (req[type] || 0) + 1;
  }

  for (const [type, needed] of Object.entries(req)) {
    if ((card.energyAttached.byType[type] || 0) < needed) return false;
  }

  return true;
}

function calculateDamage(attacker, defender, attack) {
  const attackDamage = parseDamage(attack.damage);
  let damage = Math.round((attacker.attack + attackDamage * 0.35) - defender.defense * 0.45);
  damage = Math.max(8, damage);

  if (isTypeAdvantage(attacker.types?.[0], defender.types?.[0])) {
    damage = Math.round(damage * 1.35);
  }

  return damage;
}

function otherRole(role) {
  return role === "player1" ? "player2" : "player1";
}

function nowLog(message) {
  return `[${new Date().toLocaleTimeString("pt-BR")}] ${message}`;
}

function pushLog(game, message) {
  game.logs.unshift(nowLog(message));
  game.logs = game.logs.slice(0, 100);
}

function beginTurn(game, role, incrementRound) {
  game.currentPlayer = role;
  if (incrementRound) game.turnNumber += 1;
  const player = game.players[role];
  player.hasAttackedThisTurn = false;
  player.energyPool += 1;
  const drawn = drawCards(game, role, 1);
  ensureActive(game, role);
  pushLog(game, `${player.name} iniciou o turno e comprou ${drawn} carta(s).`);
}

function createGame(player1Name, player2Name) {
  const templates = shuffle(emergencyTemplates(16));
  const game = {
    players: {
      player1: makeEmptyPlayer(player1Name),
      player2: makeEmptyPlayer(player2Name)
    },
    currentPlayer: "player1",
    turnNumber: 0,
    winner: null,
    logs: []
  };

  const p1Templates = templates.slice(0, 8);
  const p2Templates = templates.slice(8, 16);

  game.players.player1.deck = shuffle(p1Templates.map((card, idx) => instantiateCard(card, `p1-${idx + 1}-${randomToken()}`)));
  game.players.player2.deck = shuffle(p2Templates.map((card, idx) => instantiateCard(card, `p2-${idx + 1}-${randomToken()}`)));

  drawCards(game, "player1", 4);
  drawCards(game, "player2", 4);
  ensureActive(game, "player1");
  ensureActive(game, "player2");

  pushLog(game, "Nova partida iniciada.");
  beginTurn(game, "player1", true);
  return game;
}

function sanitizePlayer(game, role, viewerRole) {
  const player = game.players[role];
  const me = role === viewerRole;
  const active = getActive(player);

  return {
    name: player.name,
    deckCount: player.deck.length,
    handCount: player.hand.length,
    hiddenHandCount: me ? 0 : player.hand.length,
    discardCount: player.discard.length,
    energyPool: player.energyPool,
    knockouts: player.knockouts,
    activeCardId: player.activeCardId,
    selectedAttackIndex: me ? player.selectedAttackIndex : 0,
    hasAttackedThisTurn: player.hasAttackedThisTurn,
    activeCard: active ? clone(active) : null,
    hand: me ? clone(player.hand) : []
  };
}

function sanitizeState(session, viewerRole) {
  const ready = Boolean(session.players.player1 && session.players.player2 && session.game);
  return {
    code: session.code,
    role: viewerRole,
    ready,
    currentPlayer: ready ? session.game.currentPlayer : "player1",
    turnNumber: ready ? session.game.turnNumber : 0,
    winner: ready ? session.game.winner : null,
    logs: ready ? session.game.logs : [],
    players: {
      player1: ready
        ? sanitizePlayer(session.game, "player1", viewerRole)
        : { name: session.players.player1?.name || "Jogador 1", deckCount: 0, handCount: 0, hiddenHandCount: 0, discardCount: 0, energyPool: 0, knockouts: 0, activeCard: null, hand: [] },
      player2: ready
        ? sanitizePlayer(session.game, "player2", viewerRole)
        : { name: session.players.player2?.name || "Jogador 2", deckCount: 0, handCount: 0, hiddenHandCount: 0, discardCount: 0, energyPool: 0, knockouts: 0, activeCard: null, hand: [] }
    }
  };
}

function findSessionByAuth(code, token) {
  const session = sessions.get(code);
  if (!session) return { error: "Sala não encontrada." };
  if (session.players.player1?.token === token) return { session, role: "player1" };
  if (session.players.player2?.token === token) return { session, role: "player2" };
  return { error: "Token inválido para essa sala." };
}

function ensureReady(session) {
  if (!session.players.player1 || !session.players.player2) {
    return "A sala precisa de dois jogadores.";
  }
  if (!session.game) {
    session.game = createGame(session.players.player1.name, session.players.player2.name);
  }
  return null;
}

function handleAction(session, role, action, payload = {}) {
  const game = session.game;
  if (!game) return "Partida não iniciada.";
  if (game.winner) return "Partida já encerrada. Inicie nova partida.";
  if (game.currentPlayer !== role) return "Não é seu turno.";

  const player = game.players[role];
  const enemyRole = otherRole(role);
  const enemy = game.players[enemyRole];

  if (action === "SELECT_ACTIVE") {
    const uid = payload.uid;
    if (!uid) return "Carta inválida.";
    const exists = player.hand.find((card) => card.uid === uid);
    if (!exists) return "Carta não pertence a você.";
    player.activeCardId = uid;
    player.selectedAttackIndex = 0;
    pushLog(game, `${player.name} trocou carta ativa para ${exists.name}.`);
    return null;
  }

  if (action === "SELECT_ATTACK") {
    const idx = Number(payload.attackIndex);
    const active = getActive(player);
    if (!active) return "Você não possui carta ativa.";
    if (!Number.isFinite(idx) || idx < 0 || idx >= active.attacks.length) return "Ataque inválido.";
    player.selectedAttackIndex = idx;
    return null;
  }

  if (action === "ATTACH_ENERGY") {
    const active = getActive(player);
    if (!active) return "Sem carta ativa.";
    if (player.energyPool <= 0) return "Sem energia no pool.";

    const energyType = normalizeType(active.types?.[0] || "colorless");
    player.energyPool -= 1;
    active.energyAttached.total += 1;
    active.energyAttached.byType[energyType] = (active.energyAttached.byType[energyType] || 0) + 1;

    pushLog(game, `${player.name} anexou energia em ${active.name}.`);
    return null;
  }

  if (action === "ATTACK") {
    if (player.hasAttackedThisTurn) return "Você já atacou neste turno.";
    const attacker = getActive(player);
    const defender = getActive(enemy);
    if (!attacker || !defender) return "Falta carta ativa para atacar.";

    const attack = attacker.attacks[player.selectedAttackIndex] || attacker.attacks[0];
    if (!attack) return "Ataque indisponível.";
    if (!canUseAttack(attacker, attack)) return "Energia insuficiente para esse ataque.";

    const damage = calculateDamage(attacker, defender, attack);
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    player.hasAttackedThisTurn = true;

    pushLog(game, `${player.name} usou ${attack.name} com ${attacker.name} e causou ${damage} de dano em ${defender.name}.`);

    if (defender.currentHp <= 0) {
      player.knockouts += 1;
      pushLog(game, `${defender.name} foi derrotado.`);
      removeDefeatedActive(game, enemyRole);
      if (!game.players[enemyRole].activeCardId) {
        game.winner = role;
        pushLog(game, `${player.name} venceu a partida.`);
      }
    }
    return null;
  }

  if (action === "END_TURN") {
    const next = otherRole(role);
    const incrementRound = next === "player1";
    pushLog(game, `${player.name} encerrou o turno.`);
    beginTurn(game, next, incrementRound);
    return null;
  }

  return "Ação desconhecida.";
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Payload muito grande."));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON inválido."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Arquivo não encontrado.");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = parsed.pathname;

    if (pathname === "/api/session/create" && req.method === "POST") {
      const body = await readJsonBody(req);
      const code = randomCode();
      const token = randomToken();
      const name = String(body.name || "Jogador 1").slice(0, 24) || "Jogador 1";

      const session = {
        code,
        players: {
          player1: { name, token },
          player2: null
        },
        game: null
      };
      sessions.set(code, session);
      return sendJson(res, 200, { code, token, role: "player1" });
    }

    if (pathname === "/api/session/join" && req.method === "POST") {
      const body = await readJsonBody(req);
      const code = String(body.code || "").toUpperCase();
      const session = sessions.get(code);
      if (!session) return sendJson(res, 404, { error: "Sala não encontrada." });
      if (session.players.player2) return sendJson(res, 409, { error: "Sala já possui dois jogadores." });

      const token = randomToken();
      const name = String(body.name || "Jogador 2").slice(0, 24) || "Jogador 2";
      session.players.player2 = { name, token };
      session.game = createGame(session.players.player1.name, session.players.player2.name);

      return sendJson(res, 200, { code, token, role: "player2" });
    }

    if (pathname === "/api/session/state" && req.method === "GET") {
      const code = String(parsed.searchParams.get("code") || "").toUpperCase();
      const token = String(parsed.searchParams.get("token") || "");
      const auth = findSessionByAuth(code, token);
      if (auth.error) return sendJson(res, 401, { error: auth.error });

      return sendJson(res, 200, sanitizeState(auth.session, auth.role));
    }

    if (pathname === "/api/session/new-game" && req.method === "POST") {
      const body = await readJsonBody(req);
      const code = String(body.code || "").toUpperCase();
      const token = String(body.token || "");
      const auth = findSessionByAuth(code, token);
      if (auth.error) return sendJson(res, 401, { error: auth.error });
      if (auth.role !== "player1") return sendJson(res, 403, { error: "Somente Player 1 pode iniciar nova partida." });

      if (!auth.session.players.player2) return sendJson(res, 409, { error: "Aguardando Player 2 entrar na sala." });
      auth.session.game = createGame(auth.session.players.player1.name, auth.session.players.player2.name);
      return sendJson(res, 200, sanitizeState(auth.session, auth.role));
    }

    if (pathname === "/api/session/action" && req.method === "POST") {
      const body = await readJsonBody(req);
      const code = String(body.code || "").toUpperCase();
      const token = String(body.token || "");
      const action = String(body.action || "");
      const payload = body.payload || {};

      const auth = findSessionByAuth(code, token);
      if (auth.error) return sendJson(res, 401, { error: auth.error });

      const readyErr = ensureReady(auth.session);
      if (readyErr) return sendJson(res, 409, { error: readyErr });

      const actionErr = handleAction(auth.session, auth.role, action, payload);
      if (actionErr) return sendJson(res, 409, { error: actionErr });

      return sendJson(res, 200, sanitizeState(auth.session, auth.role));
    }

    const safePath = path.normalize(decodeURIComponent(pathname || "/"));
    let targetPath = path.join(ROOT, safePath === "/" ? "index.html" : safePath);

    if (!targetPath.startsWith(ROOT)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Acesso negado.");
      return;
    }

    fs.stat(targetPath, (err, stats) => {
      if (!err && stats.isDirectory()) targetPath = path.join(targetPath, "index.html");
      sendFile(res, targetPath);
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erro interno" });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor ativo em http://localhost:${PORT}`);
});
