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

const DECK_LIBRARY = {
  "kanto-fire": {
    id: "kanto-fire",
    label: "Fogo de Kanto",
    cards: [
      { name: "Charmander", dex: 4, type: "fire", hp: 65, atk: 32, def: 24, spd: 30, stage: "basic", evolvesTo: "Charmeleon" },
      { name: "Charmeleon", dex: 5, type: "fire", hp: 90, atk: 45, def: 34, spd: 43, stage: "stage1", evolvesFrom: "Charmander", evolvesTo: "Charizard" },
      { name: "Charizard", dex: 6, type: "fire", hp: 130, atk: 80, def: 62, spd: 70, stage: "stage2", evolvesFrom: "Charmeleon" },
      { name: "Vulpix", dex: 37, type: "fire", hp: 62, atk: 31, def: 22, spd: 33, stage: "basic", evolvesTo: "Ninetales" },
      { name: "Ninetales", dex: 38, type: "fire", hp: 108, atk: 63, def: 51, spd: 65, stage: "stage1", evolvesFrom: "Vulpix" },
      { name: "Growlithe", dex: 58, type: "fire", hp: 66, atk: 36, def: 28, spd: 34, stage: "basic", evolvesTo: "Arcanine" },
      { name: "Arcanine", dex: 59, type: "fire", hp: 116, atk: 71, def: 56, spd: 60, stage: "stage1", evolvesFrom: "Growlithe" },
      { name: "Ponyta", dex: 77, type: "fire", hp: 70, atk: 38, def: 30, spd: 36, stage: "basic", evolvesTo: "Rapidash" },
      { name: "Rapidash", dex: 78, type: "fire", hp: 106, atk: 62, def: 50, spd: 64, stage: "stage1", evolvesFrom: "Ponyta" }
    ]
  },
  "kanto-water": {
    id: "kanto-water",
    label: "Mar de Kanto",
    cards: [
      { name: "Squirtle", dex: 7, type: "water", hp: 68, atk: 30, def: 30, spd: 28, stage: "basic", evolvesTo: "Wartortle" },
      { name: "Wartortle", dex: 8, type: "water", hp: 92, atk: 43, def: 44, spd: 38, stage: "stage1", evolvesFrom: "Squirtle", evolvesTo: "Blastoise" },
      { name: "Blastoise", dex: 9, type: "water", hp: 132, atk: 78, def: 72, spd: 58, stage: "stage2", evolvesFrom: "Wartortle" },
      { name: "Magikarp", dex: 129, type: "water", hp: 56, atk: 20, def: 18, spd: 25, stage: "basic", evolvesTo: "Gyarados" },
      { name: "Gyarados", dex: 130, type: "water", hp: 124, atk: 82, def: 58, spd: 54, stage: "stage1", evolvesFrom: "Magikarp" },
      { name: "Poliwag", dex: 60, type: "water", hp: 64, atk: 28, def: 24, spd: 29, stage: "basic", evolvesTo: "Poliwhirl" },
      { name: "Poliwhirl", dex: 61, type: "water", hp: 90, atk: 44, def: 36, spd: 40, stage: "stage1", evolvesFrom: "Poliwag", evolvesTo: "Poliwrath" },
      { name: "Poliwrath", dex: 62, type: "water", hp: 118, atk: 72, def: 62, spd: 50, stage: "stage2", evolvesFrom: "Poliwhirl" },
      { name: "Lapras", dex: 131, type: "water", hp: 108, atk: 58, def: 52, spd: 46, stage: "basic" }
    ]
  },
  "kanto-grass": {
    id: "kanto-grass",
    label: "Selva de Kanto",
    cards: [
      { name: "Bulbasaur", dex: 1, type: "grass", hp: 66, atk: 30, def: 28, spd: 26, stage: "basic", evolvesTo: "Ivysaur" },
      { name: "Ivysaur", dex: 2, type: "grass", hp: 94, atk: 45, def: 42, spd: 38, stage: "stage1", evolvesFrom: "Bulbasaur", evolvesTo: "Venusaur" },
      { name: "Venusaur", dex: 3, type: "grass", hp: 134, atk: 82, def: 70, spd: 56, stage: "stage2", evolvesFrom: "Ivysaur" },
      { name: "Oddish", dex: 43, type: "grass", hp: 62, atk: 27, def: 24, spd: 24, stage: "basic", evolvesTo: "Gloom" },
      { name: "Gloom", dex: 44, type: "grass", hp: 88, atk: 40, def: 36, spd: 33, stage: "stage1", evolvesFrom: "Oddish", evolvesTo: "Vileplume" },
      { name: "Vileplume", dex: 45, type: "grass", hp: 116, atk: 66, def: 58, spd: 42, stage: "stage2", evolvesFrom: "Gloom" },
      { name: "Bellsprout", dex: 69, type: "grass", hp: 64, atk: 29, def: 24, spd: 28, stage: "basic", evolvesTo: "Weepinbell" },
      { name: "Weepinbell", dex: 70, type: "grass", hp: 90, atk: 43, def: 34, spd: 39, stage: "stage1", evolvesFrom: "Bellsprout", evolvesTo: "Victreebel" },
      { name: "Victreebel", dex: 71, type: "grass", hp: 120, atk: 74, def: 58, spd: 50, stage: "stage2", evolvesFrom: "Weepinbell" }
    ]
  },
  "kanto-electric": {
    id: "kanto-electric",
    label: "Choque de Kanto",
    cards: [
      { name: "Pichu", dex: 172, type: "electric", hp: 56, atk: 22, def: 18, spd: 30, stage: "basic", evolvesTo: "Pikachu" },
      { name: "Pikachu", dex: 25, type: "electric", hp: 74, atk: 40, def: 30, spd: 48, stage: "stage1", evolvesFrom: "Pichu", evolvesTo: "Raichu" },
      { name: "Raichu", dex: 26, type: "electric", hp: 112, atk: 72, def: 50, spd: 70, stage: "stage2", evolvesFrom: "Pikachu" },
      { name: "Magnemite", dex: 81, type: "electric", hp: 64, atk: 34, def: 28, spd: 32, stage: "basic", evolvesTo: "Magneton" },
      { name: "Magneton", dex: 82, type: "electric", hp: 98, atk: 60, def: 44, spd: 48, stage: "stage1", evolvesFrom: "Magnemite" },
      { name: "Electabuzz", dex: 125, type: "electric", hp: 96, atk: 58, def: 40, spd: 56, stage: "basic" },
      { name: "Voltorb", dex: 100, type: "electric", hp: 68, atk: 35, def: 28, spd: 46, stage: "basic", evolvesTo: "Electrode" },
      { name: "Electrode", dex: 101, type: "electric", hp: 102, atk: 64, def: 48, spd: 66, stage: "stage1", evolvesFrom: "Voltorb" },
      { name: "Jolteon", dex: 135, type: "electric", hp: 110, atk: 70, def: 52, spd: 72, stage: "basic" }
    ]
  }
};

function buildDeckCard(base, idx, deckId) {
  const hp = base.hp;
  const attack = base.atk;
  const defense = base.def;
  const speed = base.spd;
  const typeLabel = base.type === "electric" ? "Lightning" : base.type.charAt(0).toUpperCase() + base.type.slice(1);
  return {
    id: `${deckId}-${idx + 1}`,
    name: base.name,
    image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${base.dex}.png`,
    types: [base.type],
    hp,
    attack,
    defense,
    speed,
    stage: base.stage || "basic",
    evolvesFrom: base.evolvesFrom || null,
    evolvesTo: base.evolvesTo || null,
    attacks: [
      { name: "Golpe Rápido", damage: 24 + Math.round(attack * 0.14), cost: ["Colorless"] },
      { name: "Golpe Forte", damage: 38 + Math.round(attack * 0.22), cost: [typeLabel, "Colorless"] }
    ]
  };
}

function getDeckTemplates(deckId) {
  const deck = DECK_LIBRARY[deckId];
  if (!deck) return [];
  return deck.cards.map((card, idx) => buildDeckCard(card, idx, deckId));
}

function randomDeckOptions(count = 3) {
  return shuffle(Object.keys(DECK_LIBRARY)).slice(0, count);
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
    hasEvolvedThisTurn: false,
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
  player.hasEvolvedThisTurn = false;
  player.energyPool += 1;
  const drawn = drawCards(game, role, 1);
  ensureActive(game, role);
  pushLog(game, `${player.name} iniciou o turno e comprou ${drawn} carta(s).`);
}

function createGame(player1Name, player2Name, player1DeckId, player2DeckId, evolutionEnabled = true) {
  const p1TemplatesRaw = getDeckTemplates(player1DeckId);
  const p2TemplatesRaw = getDeckTemplates(player2DeckId);
  const p1Templates = shuffle(p1TemplatesRaw.length ? p1TemplatesRaw : getDeckTemplates("kanto-fire"));
  const p2Templates = shuffle(p2TemplatesRaw.length ? p2TemplatesRaw : getDeckTemplates("kanto-water"));

  const game = {
    players: {
      player1: makeEmptyPlayer(player1Name),
      player2: makeEmptyPlayer(player2Name)
    },
    currentPlayer: "player1",
    turnNumber: 0,
    winner: null,
    logs: [],
    settings: {
      evolutionEnabled: Boolean(evolutionEnabled)
    }
  };

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
  const viewerDeckOptions = session.deckOptions?.[viewerRole] || [];
  const selectedMine = session.selectedDeck?.[viewerRole] || null;
  const selectedOther = session.selectedDeck?.[otherRole(viewerRole)] || null;
  return {
    code: session.code,
    role: viewerRole,
    ready,
    currentPlayer: ready ? session.game.currentPlayer : "player1",
    turnNumber: ready ? session.game.turnNumber : 0,
    winner: ready ? session.game.winner : null,
    settings: {
      evolutionEnabled: ready
        ? Boolean(session.game.settings?.evolutionEnabled)
        : Boolean(session.settings?.evolutionEnabled ?? true)
    },
    logs: ready ? session.game.logs : [],
    ranking: session.ranking || { player1Wins: 0, player2Wins: 0, draws: 0 },
    chat: (session.chat || []).slice(0, 80),
    typing: session.typing || { player1: false, player2: false },
    rematchVotes: session.rematchVotes || { player1: false, player2: false },
    deckSelection: {
      options: viewerDeckOptions.map((deckId) => ({
        id: deckId,
        label: DECK_LIBRARY[deckId]?.label || deckId,
        preview: (getDeckTemplates(deckId) || []).map((card) => ({
          name: card.name,
          image: card.image,
          type: card.types?.[0] || "colorless",
          stage: card.stage || "basic",
          evolvesFrom: card.evolvesFrom || null,
          evolvesTo: card.evolvesTo || null
        }))
      })),
      selected: selectedMine,
      myDeckReady: Boolean(selectedMine),
      opponentDeckReady: Boolean(selectedOther)
    },
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
  if (!session.selectedDeck?.player1 || !session.selectedDeck?.player2) {
    return "Ambos os jogadores precisam escolher um deck.";
  }
  if (!session.game) {
    session.game = createGame(
      session.players.player1.name,
      session.players.player2.name,
      session.selectedDeck.player1,
      session.selectedDeck.player2,
      session.settings?.evolutionEnabled ?? true
    );
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
        if (!session.ranking) session.ranking = { player1Wins: 0, player2Wins: 0, draws: 0 };
        if (role === "player1") session.ranking.player1Wins += 1;
        else session.ranking.player2Wins += 1;
        pushLog(game, `${player.name} venceu a partida.`);
      }
    }
    return null;
  }

  if (action === "EVOLVE_ACTIVE") {
    if (!game.settings?.evolutionEnabled) return "Regra de evolução está desativada nesta partida.";
    if (player.hasEvolvedThisTurn) return "Você já evoluiu neste turno.";

    const active = getActive(player);
    if (!active) return "Sem carta ativa para evoluir.";

    const target = player.hand.find((card) => card.uid !== active.uid && card.evolvesFrom === active.name);
    if (!target) return "Nenhuma evolução disponível para a carta ativa.";

    const oldActiveName = active.name;
    const oldActiveUid = active.uid;
    const oldIndex = player.hand.findIndex((c) => c.uid === oldActiveUid);
    const targetIndex = player.hand.findIndex((c) => c.uid === target.uid);

    if (oldIndex < 0 || targetIndex < 0) return "Falha ao evoluir carta ativa.";

    const targetCard = player.hand[targetIndex];

    targetCard.currentHp = Math.max(targetCard.currentHp, targetCard.hp - Math.max(0, active.hp - active.currentHp));
    targetCard.energyAttached = clone(active.energyAttached);
    targetCard.uid = oldActiveUid;

    if (oldIndex > targetIndex) {
      player.hand.splice(oldIndex, 1);
      player.hand.splice(targetIndex, 1);
    } else {
      player.hand.splice(targetIndex, 1);
      player.hand.splice(oldIndex, 1);
    }

    player.hand.push(targetCard);
    player.activeCardId = targetCard.uid;
    player.hasEvolvedThisTurn = true;

    pushLog(game, `${player.name} evoluiu ${oldActiveName} para ${targetCard.name}.`);
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
        game: null,
        ranking: { player1Wins: 0, player2Wins: 0, draws: 0 },
        chat: [],
        typing: { player1: false, player2: false },
        rematchVotes: { player1: false, player2: false },
        deckOptions: {
          player1: randomDeckOptions(3),
          player2: []
        },
        selectedDeck: {
          player1: null,
          player2: null
        },
        settings: {
          evolutionEnabled: true
        }
      };
      session.chat.unshift(nowLog(`${name} criou a sala.`));
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
      session.game = null;
      session.rematchVotes = { player1: false, player2: false };
      session.typing = { player1: false, player2: false };
      session.deckOptions.player2 = randomDeckOptions(3);
      session.selectedDeck.player1 = null;
      session.selectedDeck.player2 = null;
      session.chat.unshift(nowLog(`${name} entrou na sala.`));

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
      if (!auth.session.selectedDeck?.player1 || !auth.session.selectedDeck?.player2) {
        return sendJson(res, 409, { error: "Ambos precisam escolher o deck antes de iniciar a partida." });
      }
      auth.session.game = createGame(
        auth.session.players.player1.name,
        auth.session.players.player2.name,
        auth.session.selectedDeck.player1,
        auth.session.selectedDeck.player2,
        auth.session.settings?.evolutionEnabled ?? true
      );
      auth.session.rematchVotes = { player1: false, player2: false };
      auth.session.typing = { player1: false, player2: false };
      auth.session.chat.unshift(nowLog(`${auth.session.players.player1.name} iniciou nova partida.`));
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

      if (action === "SELECT_DECK") {
        const deckId = String(payload.deckId || "");
        const ownOptions = auth.session.deckOptions?.[auth.role] || [];
        if (!ownOptions.includes(deckId)) return sendJson(res, 409, { error: "Deck inválido para esse jogador." });
        if (!auth.session.selectedDeck) auth.session.selectedDeck = { player1: null, player2: null };
        auth.session.selectedDeck[auth.role] = deckId;
        const author = auth.session.players[auth.role]?.name || auth.role;
        auth.session.chat.unshift(nowLog(`${author} escolheu o deck.`));
        auth.session.chat = auth.session.chat.slice(0, 80);
        return sendJson(res, 200, sanitizeState(auth.session, auth.role));
      }

      if (action === "TOGGLE_EVOLUTION_RULE") {
        if (auth.role !== "player1") return sendJson(res, 403, { error: "Somente Player 1 pode alterar a regra de evolução." });
        if (!auth.session.settings) auth.session.settings = { evolutionEnabled: true };
        auth.session.settings.evolutionEnabled = Boolean(payload.enabled);
        if (auth.session.game) {
          auth.session.game.settings = auth.session.game.settings || {};
          auth.session.game.settings.evolutionEnabled = Boolean(payload.enabled);
        }
        auth.session.chat.unshift(nowLog(`Regra de evolução ${payload.enabled ? "ativada" : "desativada"} por ${auth.session.players.player1?.name || "Player 1"}.`));
        auth.session.chat = auth.session.chat.slice(0, 80);
        return sendJson(res, 200, sanitizeState(auth.session, auth.role));
      }

      if (action === "CHAT") {
        const text = String(payload.text || "").trim();
        if (!text) return sendJson(res, 409, { error: "Mensagem vazia." });
        if (!auth.session.chat) auth.session.chat = [];
        if (!auth.session.typing) auth.session.typing = { player1: false, player2: false };
        const author = auth.session.players[auth.role]?.name || auth.role;
        auth.session.typing[auth.role] = false;
        auth.session.chat.unshift(nowLog(`${author}: ${text.slice(0, 280)}`));
        auth.session.chat = auth.session.chat.slice(0, 80);
        return sendJson(res, 200, sanitizeState(auth.session, auth.role));
      }

      if (action === "CHAT_TYPING") {
        if (!auth.session.typing) auth.session.typing = { player1: false, player2: false };
        auth.session.typing[auth.role] = Boolean(payload.typing);
        return sendJson(res, 200, sanitizeState(auth.session, auth.role));
      }

      if (action === "REMATCH") {
        if (!auth.session.game || !auth.session.game.winner) {
          return sendJson(res, 409, { error: "A revanche só pode ser pedida após o fim da partida." });
        }
        if (!auth.session.rematchVotes) auth.session.rematchVotes = { player1: false, player2: false };
        auth.session.rematchVotes[auth.role] = true;
        const requester = auth.session.players[auth.role]?.name || auth.role;
        auth.session.chat.unshift(nowLog(`${requester} pediu revanche.`));
        auth.session.chat = auth.session.chat.slice(0, 80);

        if (auth.session.rematchVotes.player1 && auth.session.rematchVotes.player2) {
          const p1Deck = auth.session.selectedDeck?.player1 || auth.session.deckOptions?.player1?.[0];
          const p2Deck = auth.session.selectedDeck?.player2 || auth.session.deckOptions?.player2?.[0];
          auth.session.game = createGame(
            auth.session.players.player1.name,
            auth.session.players.player2.name,
            p1Deck,
            p2Deck,
            auth.session.settings?.evolutionEnabled ?? true
          );
          auth.session.rematchVotes = { player1: false, player2: false };
          auth.session.typing = { player1: false, player2: false };
          auth.session.chat.unshift(nowLog("Revanche iniciada."));
          auth.session.chat = auth.session.chat.slice(0, 80);
        }
        return sendJson(res, 200, sanitizeState(auth.session, auth.role));
      }

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
