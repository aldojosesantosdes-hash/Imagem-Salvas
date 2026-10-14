import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, pickChallenges, turnRatio, CHALLENGES, CONFIG } from '../src/logic.js';

// RNG determinístico para os testes.
function seeded(seed = 1) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function lm({ noseX = 0.5 } = {}) {
  const arr = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  arr[234] = { x: 0.4, y: 0.5 };
  arr[454] = { x: 0.6, y: 0.5 };
  arr[1] = { x: noseX, y: 0.5 };
  return arr;
}

const base = { faces: 1, centerOffset: 0, size: 0.4, blink: 0.05, smile: 0.05, turn: 0 };

// Executa a sessão alimentando quadros de 33 ms; `script(t)` devolve os campos variáveis.
function run(session, script, durationMs = 20000) {
  let snap;
  for (let t = 0; t <= durationMs; t += 33) {
    snap = session.update({ ...base, t, ...script(t, session.snapshot()) });
    if (snap.status !== 'running') break;
  }
  return snap;
}

// Rosto "cooperativo": responde ao desafio atual; tem pequeno jitter natural.
function cooperative(t, snap) {
  const jitter = Math.sin(t / 90) * 0.04;
  const phase = Math.floor(t / 600) % 2; // alterna neutro / ação a cada 600 ms
  switch (snap.current) {
    case 'blink': return { turn: jitter, blink: phase ? 0.9 : 0.05 };
    case 'smile': return { turn: jitter, smile: phase ? 0.9 : 0.05 };
    case 'turn_left': return { turn: phase ? 0.6 : jitter };
    case 'turn_right': return { turn: phase ? -0.6 : jitter };
    default: return {};
  }
}

test('pickChallenges devolve desafios distintos e válidos', () => {
  const c = pickChallenges(seeded(7), 3);
  assert.equal(new Set(c).size, 3);
  c.forEach((x) => assert.ok(CHALLENGES.includes(x)));
});

test('a ordem dos desafios varia entre sessões (anti-replay)', () => {
  const orders = new Set();
  for (let s = 1; s <= 30; s++) orders.add(pickChallenges(seeded(s), 3).join(','));
  assert.ok(orders.size > 3);
});

test('turnRatio: nariz à direita da imagem => positivo (esquerda do usuário)', () => {
  assert.ok(turnRatio(lm({ noseX: 0.5 })) === 0);
  assert.ok(turnRatio(lm({ noseX: 0.56 })) > 0.5);
  assert.ok(turnRatio(lm({ noseX: 0.44 })) < -0.5);
});

test('rosto cooperativo passa em todos os desafios', () => {
  const s = createSession({ rng: seeded(3) });
  const snap = run(s, cooperative);
  assert.equal(snap.status, 'passed', JSON.stringify(snap));
  assert.equal(snap.log.length, 3);
  assert.ok(snap.log.every((l) => l.ok));
});

test('imagem estática (foto) é reprovada: nunca cumpre desafios', () => {
  const s = createSession({ rng: seeded(3) });
  const snap = run(s, () => ({}));
  assert.equal(snap.status, 'failed');
  assert.match(snap.reasons.join(' '), /tempo esgotado/);
});

test('olho fechado por muito tempo não conta como piscada', () => {
  let s;
  for (let seed = 1; seed < 200; seed++) {
    s = createSession({ rng: seeded(seed * 104729) });
    if (s.challenges[0] === 'blink') break;
  }
  assert.equal(s.challenges[0], 'blink');
  const snap = run(s, (t) => ({ blink: t > 500 ? 0.9 : 0.05 }), 9000);
  assert.equal(snap.status, 'failed');
});

test('mais de um rosto reinicia o progresso e exibe aviso', () => {
  const s = createSession({ rng: seeded(3) });
  const snap = s.update({ ...base, t: 0, faces: 2 });
  assert.match(snap.hint, /uma pessoa/i);
  assert.equal(snap.index, 0);
});

test('rosto pequeno ou descentralizado não avança', () => {
  const s = createSession({ rng: seeded(3) });
  assert.match(s.update({ ...base, t: 0, size: 0.05 }).hint, /Aproxime/);
  assert.match(s.update({ ...base, t: 40, centerOffset: 0.5 }).hint, /Centralize/);
});

test('timeout configurável reprova a sessão', () => {
  const s = createSession({ rng: seeded(3), config: { ...CONFIG, challengeTimeoutMs: 500 } });
  const snap = run(s, () => ({}), 2000);
  assert.equal(snap.status, 'failed');
});
