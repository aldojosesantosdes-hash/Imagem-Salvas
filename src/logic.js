// Lógica pura de vivacidade: sem DOM, sem câmera, sem MediaPipe.
// Isso permite testar tudo com `npm test`.

export const CHALLENGES = ['blink', 'turn_left', 'turn_right', 'smile'];

export const CONFIG = {
  challengeTimeoutMs: 8000,
  challengeCount: 3,
  blinkClosed: 0.55,
  blinkOpen: 0.25,
  blinkMaxMs: 1000,
  smileOn: 0.6,
  smileNeutral: 0.3,
  turnOn: 0.35,
  turnNeutral: 0.15,
  minFaceSize: 0.2, // largura do rosto / largura do frame
  maxOffCenter: 0.25,
  staticWindowMs: 2500,
  staticEpsilon: 0.0008,
};

// Índices do MediaPipe Face Landmarker (malha de 478 pontos).
export const LM = { nose: 1, faceEdgeA: 234, faceEdgeB: 454 };

export function randomNonce(rng = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) s += Math.floor(rng() * 16).toString(16);
  return s;
}

// Embaralha (Fisher-Yates) e escolhe `count` desafios distintos.
export function pickChallenges(rng = Math.random, count = CONFIG.challengeCount) {
  const pool = [...CHALLENGES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

// Razão de giro da cabeça: 0 = de frente.
// No frame NÃO espelhado da câmera, virar para a esquerda do usuário leva o nariz
// para a direita da imagem (x maior), então "esquerda" => razão positiva.
export function turnRatio(landmarks) {
  const nose = landmarks[LM.nose];
  const a = landmarks[LM.faceEdgeA];
  const b = landmarks[LM.faceEdgeB];
  const half = (b.x - a.x) / 2;
  if (!(Math.abs(half) > 1e-6)) return 0;
  return (nose.x - (a.x + b.x) / 2) / half;
}

export function faceWidth(landmarks) {
  return Math.abs(landmarks[LM.faceEdgeB].x - landmarks[LM.faceEdgeA].x);
}

export function averageScore(blendshapes, names) {
  const values = names.map((n) => blendshapes[n] ?? 0);
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export const label = {
  blink: 'Pisque os dois olhos uma vez',
  turn_left: 'Vire a cabeça para a sua esquerda',
  turn_right: 'Vire a cabeça para a sua direita',
  smile: 'Sorria mostrando os dentes',
};

// Sessão de verificação. Alimente com `update(frame)` a cada quadro.
// frame = { t, faces, centerOffset, size, blink, smile, turn }
export function createSession({ rng = Math.random, config = CONFIG } = {}) {
  const challenges = pickChallenges(rng, config.challengeCount);
  const nonce = randomNonce(rng);
  const log = [];
  const history = []; // [{t, turn, noseJitterSource}]
  let index = 0;
  let status = 'running'; // running | passed | failed
  let reasons = [];
  let startedAt = null;
  let challengeStart = null;
  let stage = 0; // etapa interna do desafio atual
  let closedAt = null;
  let lastBlinkOpenCandidate = false;

  function fail(reason, t) {
    status = 'failed';
    reasons.push(reason);
    log.push({ type: challenges[index], ok: false, ms: challengeStart == null ? 0 : t - challengeStart, reason });
  }

  function complete(t) {
    log.push({ type: challenges[index], ok: true, ms: t - challengeStart });
    index += 1;
    stage = 0;
    closedAt = null;
    challengeStart = t;
    if (index >= challenges.length) finish(t);
  }

  function motionSpread(t) {
    const recent = history.filter((h) => t - h.t <= config.staticWindowMs);
    if (recent.length < 10) return null;
    const turns = recent.map((h) => h.turn);
    const mean = turns.reduce((s, v) => s + v, 0) / turns.length;
    return turns.reduce((s, v) => s + (v - mean) ** 2, 0) / turns.length;
  }

  function finish(t) {
    // Passiva: um vídeo "congelado" por toda a sessão é suspeito.
    const spread = motionSpread(t);
    if (spread !== null && spread < config.staticEpsilon) {
      status = 'failed';
      reasons.push('imagem estática: sem micro-movimentos naturais');
      return;
    }
    status = 'passed';
  }

  function update(frame) {
    if (status !== 'running') return snapshot();
    const t = frame.t;
    if (startedAt == null) {
      startedAt = t;
      challengeStart = t;
    }

    if (frame.faces !== 1) {
      // Zero ou vários rostos: reinicia o progresso do desafio atual.
      stage = 0;
      closedAt = null;
      challengeStart = t;
      return snapshot({ hint: frame.faces === 0 ? 'Posicione seu rosto na câmera' : 'Apenas uma pessoa na câmera' });
    }
    if (frame.size < config.minFaceSize) {
      return snapshot({ hint: 'Aproxime o rosto da câmera' });
    }
    if (Math.abs(frame.centerOffset) > config.maxOffCenter) {
      return snapshot({ hint: 'Centralize o rosto' });
    }

    history.push({ t, turn: frame.turn });
    while (history.length && t - history[0].t > config.staticWindowMs * 2) history.shift();

    if (t - challengeStart > config.challengeTimeoutMs) {
      fail('tempo esgotado', t);
      return snapshot();
    }

    const type = challenges[index];
    if (type === 'blink') {
      const closed = frame.blink >= config.blinkClosed;
      const open = frame.blink <= config.blinkOpen;
      if (stage === 0 && open) stage = 1; // precisa começar com olhos abertos
      else if (stage === 1 && closed) {
        stage = 2;
        closedAt = t;
      } else if (stage === 2) {
        if (t - closedAt > config.blinkMaxMs) {
          stage = 1; // olho fechado por tempo demais: não é piscada
          closedAt = null;
        } else if (open) {
          complete(t);
        }
      }
    } else if (type === 'smile') {
      if (stage === 0 && frame.smile <= config.smileNeutral) stage = 1; // exige rosto neutro antes
      else if (stage === 1 && frame.smile >= config.smileOn) complete(t);
    } else {
      const sign = type === 'turn_left' ? 1 : -1;
      const v = frame.turn * sign;
      if (stage === 0 && Math.abs(frame.turn) <= config.turnNeutral) stage = 1; // começa de frente
      else if (stage === 1 && v >= config.turnOn) complete(t);
    }
    return snapshot();
  }

  function snapshot(extra = {}) {
    return {
      status,
      nonce,
      challenges,
      index,
      current: status === 'running' ? challenges[index] : null,
      log: [...log],
      reasons: [...reasons],
      passed: status === 'passed',
      ...extra,
    };
  }

  return { update, snapshot, challenges, nonce };
}
