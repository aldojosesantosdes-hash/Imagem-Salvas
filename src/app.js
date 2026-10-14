import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { createSession, turnRatio, faceWidth, averageScore, label } from './logic.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const VIRTUAL_CAMERA = /obs|virtual|manycam|snap camera|droidcam|xsplit|vcam|epoccam|iriun|camo/i;

const $ = (id) => document.getElementById(id);
const video = $('video');
const startBtn = $('start');
const instruction = $('instruction');
const hint = $('hint');
const steps = $('steps');
const result = $('result');
const warn = $('warn');

let landmarker = null;
let stream = null;
let session = null;
let rafId = 0;
let lastVideoTime = -1;

function setInstruction(text, tone = '') {
  instruction.textContent = text;
  instruction.dataset.tone = tone;
}

function renderSteps(snap) {
  steps.innerHTML = '';
  snap.challenges.forEach((c, i) => {
    const li = document.createElement('li');
    const done = snap.log.find((l, k) => k === i);
    li.textContent = label[c];
    li.className = done ? (done.ok ? 'ok' : 'bad') : i === snap.index && snap.status === 'running' ? 'now' : '';
    steps.appendChild(li);
  });
}

function showResult(snap) {
  result.hidden = false;
  result.dataset.ok = snap.passed ? 'true' : 'false';
  const rows = snap.log.map((l) => `<li>${label[l.type]}: <b>${l.ok ? 'ok' : 'falhou'}</b> (${(l.ms / 1000).toFixed(1)} s)</li>`).join('');
  result.innerHTML = `
    <h2>${snap.passed ? 'Vivacidade confirmada' : 'Verificação reprovada'}</h2>
    <ul>${rows}</ul>
    ${snap.reasons.length ? `<p>Motivo: ${snap.reasons.join('; ')}</p>` : ''}
    <p class="small">Sessão ${snap.nonce}. Este resultado é uma demonstração local; em produção a decisão precisa ser tomada no servidor.</p>`;
}

async function checkVirtualCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const track = stream.getVideoTracks()[0];
    const name = `${track.label} ${devices.filter((d) => d.kind === 'videoinput').map((d) => d.label).join(' ')}`;
    if (VIRTUAL_CAMERA.test(track.label)) {
      warn.hidden = false;
      warn.textContent = `Câmera "${track.label}" parece virtual. A verificação em produção deve ser feita por SDK nativo ou atestação do dispositivo.`;
    }
    return name;
  } catch {
    return '';
  }
}

async function loadModel() {
  if (landmarker) return;
  setInstruction('Carregando modelo de rosto…');
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 2, // detecta 2 para poder reprovar "mais de uma pessoa"
    outputFaceBlendshapes: true,
  });
}

function loop() {
  rafId = requestAnimationFrame(loop);
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const now = performance.now();
  const res = landmarker.detectForVideo(video, now);
  const faces = res.faceLandmarks.length;
  const frame = { t: now, faces, centerOffset: 0, size: 0, blink: 0, smile: 0, turn: 0 };
  if (faces >= 1) {
    const lm = res.faceLandmarks[0];
    const bs = Object.fromEntries(res.faceBlendshapes[0].categories.map((c) => [c.categoryName, c.score]));
    frame.size = faceWidth(lm);
    frame.centerOffset = (lm[1].x - 0.5) * 2;
    frame.turn = turnRatio(lm);
    frame.blink = averageScore(bs, ['eyeBlinkLeft', 'eyeBlinkRight']);
    frame.smile = averageScore(bs, ['mouthSmileLeft', 'mouthSmileRight']);
  }
  const snap = session.update(frame);
  hint.textContent = snap.hint || '';
  renderSteps(snap);
  if (snap.status === 'running') {
    setInstruction(label[snap.current]);
  } else {
    stop();
    setInstruction(snap.passed ? 'Concluído' : 'Não foi possível confirmar', snap.passed ? 'ok' : 'bad');
    showResult(snap);
    startBtn.disabled = false;
    startBtn.textContent = 'Tentar novamente';
  }
}

function stop() {
  cancelAnimationFrame(rafId);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  result.hidden = true;
  warn.hidden = true;
  try {
    await loadModel();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    await checkVirtualCamera();
    video.srcObject = stream;
    await video.play();
    session = createSession();
    lastVideoTime = -1;
    loop();
  } catch (e) {
    startBtn.disabled = false;
    setInstruction(
      e && e.name === 'NotAllowedError' ? 'Permissão de câmera negada' : 'Erro ao iniciar: ' + (e && e.message ? e.message : e),
      'bad',
    );
  }
});
