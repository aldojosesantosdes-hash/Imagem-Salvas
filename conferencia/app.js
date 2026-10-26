import { linhasDeItens, interpretarEscala, sufixoComum, efetivo, resumo, slug } from './parser.js';
import { gerarPdf, lerMarcacoes } from './gerar-pdf.js';
import { gerarRelease, tituloCaso, separarPosto } from './release.js';

const CHAVE = 'conferencia-presenca-v1';
const $ = (id) => document.getElementById(id);
window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

let st = carregar() || novoEstado();
let vista = 'todos';

function novoEstado() {
  return { escala: null, sel: [], marcas: {}, meta: { titulo: '', subtitulo: '', responsavel: '', emitente: '' }, conferidoEm: '' };
}
function carregar() {
  try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch { /* armazenamento indisponível */ }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
const vibrar = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* sem suporte */ } };

// Avisos flutuantes; erros ficam mais tempo. `acao` = { rotulo, fn } adiciona um botão (ex.: Desfazer).
function aviso(texto, tipo = 'info', acao = null) {
  if (!texto) return;
  const t = document.createElement('div');
  t.className = `toast ${tipo === 'err' ? 'err' : ''}`;
  t.innerHTML = `<span>${esc(texto)}</span>`;
  if (acao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = acao.rotulo;
    b.onclick = () => { acao.fn(); fechar(); };
    t.appendChild(b);
  }
  const box = $('msg');
  while (box.children.length >= 2) box.firstChild.remove();
  box.appendChild(t);
  let saiu = false;
  function fechar() {
    if (saiu) return;
    saiu = true;
    t.classList.add('out');
    setTimeout(() => t.remove(), 230);
  }
  setTimeout(fechar, tipo === 'err' ? 7000 : acao ? 6000 : 3200);
}

// ---------- Leitura do PDF ----------
async function lerPdf(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  let linhas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pg = await pdf.getPage(n);
    const tc = await pg.getTextContent();
    // Ignora texto girado (marca d'água).
    const itens = tc.items
      .filter((i) => Math.abs(i.transform[1]) < 0.01 && Math.abs(i.transform[2]) < 0.01)
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    linhas = linhas.concat(linhasDeItens(itens));
  }
  return { escala: interpretarEscala(linhas), bytes };
}

async function abrir(arquivo) {
  if (!arquivo) return;
  aviso('Lendo o PDF…');
  try {
    const { escala, bytes } = await lerPdf(arquivo);
    if (!escala.secoes.length) {
      aviso('Não encontrei a escala neste PDF. Ele precisa ter texto selecionável (não pode ser foto) e blocos "FUNÇÃO - DATA: dd/mm/aaaa, DE 00h00 ÀS 00h00" com a tabela Nome / Matrícula / Função.', 'err');
      return;
    }
    const emitente = st.meta.emitente;
    st = novoEstado();
    st.escala = escala;
    st.sel = escala.secoes.map((_, i) => i);
    st.meta.titulo = escala.titulo;
    st.meta.subtitulo = escala.subtitulo;
    st.meta.emitente = emitente;
    st.meta.responsavel = sugerirResponsavel();

    const prev = await lerMarcacoes(bytes);
    let recuperadas = 0;
    for (const p of efetivo(st.escala, st.sel)) {
      const r = prev[p.campo] || prev[`#${p.chave}`];
      if (!r) continue;
      const obs = (r.obs || '').trim();
      if (r.marcado) st.marcas[p.chave] = { status: 'P', obs };
      else if (/^FALTA/i.test(obs)) st.marcas[p.chave] = { status: 'F', obs: obs.replace(/^FALTA\s*-?\s*/i, '') };
      else if (obs) st.marcas[p.chave] = { status: '', obs };
      else continue;
      recuperadas++;
    }
    vista = 'todos';
    salvar();
    renderTudo();
    const total = escala.secoes.reduce((n, s) => n + s.policiais.length, 0);
    aviso(recuperadas
      ? `${total} policiais · ${recuperadas} marcações recuperadas da conferência anterior.`
      : `${escala.secoes.length} seções e ${total} policiais lidos. Escolha a equipe.`);
  } catch (e) {
    console.error(e);
    aviso(`Não foi possível ler o PDF: ${e.message}`, 'err');
  }
}

function selecionados() {
  return efetivo(st.escala, st.sel);
}
function sugerirResponsavel() {
  const lista = selecionados();
  const cmd = lista.find((p) => /comandante|coordenador/i.test(p.funcao));
  return (cmd || lista[0] || {}).nome || '';
}
function sugerirSubtitulo() {
  const titulos = st.sel.map((i) => st.escala.secoes[i].titulo);
  const suf = sufixoComum(titulos);
  // "PORTAL ..." quando as seções são de um portal de abordagem, como no modelo.
  return suf && !/PORTAL/i.test(suf) && titulos.some((t) => /PORTAL/i.test(t)) ? `PORTAL ${suf}` : suf;
}
const horaCurta = (h) => String(h || '').replace(/h00$/i, 'h');

// Grupos de seleção rápida: "Setor 1 · 07h–13h" e blocos que se repetem ("Escolta de Urnas · 14h–20h").
function gruposRapidos() {
  const mapa = new Map();
  st.escala.secoes.forEach((s, i) => {
    const hora = `${horaCurta(s.horaInicio)}–${horaCurta(s.horaFim)}`;
    const setor = (s.titulo.match(/^(SETOR\s+\d+[A-Z]?)\b/i) || [])[1];
    const base = setor || s.titulo.split(/\s+-\s+/)[0];
    const chave = `${base.toUpperCase()}|${hora}`;
    if (!mapa.has(chave)) mapa.set(chave, { rotulo: `${tituloCaso(base)} · ${hora}`, setor: !!setor, idx: [] });
    mapa.get(chave).idx.push(i);
  });
  const grupos = [...mapa.values()].filter((g) => g.setor || g.idx.length >= 2);
  return grupos.length > 1 || (grupos[0] && grupos[0].idx.length < st.escala.secoes.length) ? grupos : [];
}
const mesmaSelecao = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);

// ---------- Renderização ----------
function renderTudo() {
  const tem = !!st.escala;
  $('vazio').classList.toggle('hidden', tem);
  for (const id of ['setup', 'conf', 'foot', 'btnDados']) $(id).classList.toggle('hidden', !tem);
  if (!tem) {
    $('hdrTitulo').textContent = 'Conferência Digital de Presença';
    $('hdrSub').textContent = 'Carregue a escala para começar';
    return;
  }
  for (const k of ['titulo', 'subtitulo', 'responsavel', 'emitente']) $(k).value = st.meta[k] || '';
  renderCabecalho();
  renderSecoes();
  renderLista();
}

function renderCabecalho() {
  $('hdrTitulo').textContent = st.meta.titulo || 'Conferência Digital de Presença';
  const datas = [...new Set(st.sel.map((i) => st.escala.secoes[i].data))];
  $('hdrSub').textContent = [st.meta.subtitulo, datas.join(' e ')].filter(Boolean).join(' · ') || 'Selecione a equipe';
}

let gruposAtuais = [];
function renderSecoes() {
  const grupos = gruposRapidos();
  const todas = st.escala.secoes.map((_, i) => i);
  gruposAtuais = [{ rotulo: 'Todas', idx: todas }, ...grupos];
  $('chips').innerHTML = gruposAtuais.map((g, k) => {
    const n = g.idx.reduce((t, i) => t + st.escala.secoes[i].policiais.length, 0);
    return `<button class="chip" type="button" data-g="${k}" aria-pressed="${mesmaSelecao(st.sel, g.idx)}">${esc(g.rotulo)}<small>${n}</small></button>`;
  }).join('');
  $('chips').classList.toggle('hidden', !grupos.length);
  $('chips').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  const n = selecionados().length;
  $('selInfo').textContent = `${st.sel.length} de ${st.escala.secoes.length} seções · ${n} policiais — ajustar`;
  $('secs').innerHTML = st.escala.secoes.map((s, i) => `
    <label><input type="checkbox" data-sec="${i}" ${st.sel.includes(i) ? 'checked' : ''}>
      <span>${esc(s.titulo)}<small>${esc(s.data)} · ${esc(s.horaInicio)} às ${esc(s.horaFim)} · ${s.policiais.length} policial(is)</small></span>
    </label>`).join('');
}

function iniciais(nome) {
  const partes = separarPosto(nome).resto.split(/\s+/).filter((w) => w.length > 2);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function visivel(p) {
  const s = st.marcas[p.chave]?.status;
  if (vista === 'pend' && s) return false;
  if (vista === 'faltas' && s !== 'F') return false;
  const termo = $('busca').value.trim().toUpperCase();
  return !termo || p.nome.toUpperCase().includes(termo) || p.matricula.includes(termo);
}

function contagem(ps) {
  return `${ps.filter((p) => st.marcas[p.chave]?.status).length}/${ps.length}`;
}

function renderLista() {
  const grupos = new Map();
  for (const p of selecionados()) {
    if (!grupos.has(p.secao)) grupos.set(p.secao, []);
    grupos.get(p.secao).push(p);
  }
  const html = [...grupos].map(([si, ps]) => {
    const vis = ps.filter(visivel);
    if (!vis.length) return '';
    const s = st.escala.secoes[si];
    return `<div class="group-title"><div><b>${esc(s.titulo)}</b><small>${esc(s.data)} · ${esc(s.horaInicio)} às ${esc(s.horaFim)}</small></div><span class="cnt num" data-cnt="${si}">${contagem(ps)}</span></div>
      <div class="card people">${vis.map(linhaHtml).join('')}</div>`;
  }).join('');
  const vazio = vista === 'pend' ? 'Todos conferidos. Gere o PDF ou o extrato.' : vista === 'faltas' ? 'Nenhuma falta registrada.' : 'Nenhum policial nas seções selecionadas.';
  $('lista').innerHTML = html || `<p class="empty">${vazio}</p>`;
  renderCabecalho();
  renderResumo();
}

function linhaHtml(p) {
  const m = st.marcas[p.chave] || {};
  const cmd = /comandante|coordenador/i.test(p.funcao);
  return `<div class="p ${m.obs ? 'open' : ''}" data-k="${p.chave}" data-st="${m.status || ''}">
    <div class="av" aria-hidden="true">${esc(iniciais(p.nome))}</div>
    <div class="who">
      <div class="name ${cmd ? 'cmd' : ''}">${esc(p.nome)}${cmd ? '<span class="tag">CMT</span>' : ''}</div>
      <div class="meta num">${esc(p.matricula)} · ${esc(p.funcao)}</div>
    </div>
    <div class="acts">
      <button class="bP" data-act="P" type="button" aria-label="Presente">P</button>
      <button class="bF" data-act="F" type="button" aria-label="Falta">F</button>
    </div>
    <div class="obsrow">
      <button class="addobs" type="button" data-addobs>${ico('plus')}Observação</button>
      <div class="obsbox">
        <input class="obs" type="text" placeholder="Atraso, substituição…" value="${esc(m.obs)}">
        <div class="qchips"><button type="button" data-chip="Atraso">Atraso</button><button type="button" data-chip="Substituído por ">Substituição</button><button type="button" data-chip="Dispensado">Dispensado</button></div>
      </div>
    </div>
  </div>`;
}

function renderResumo() {
  const r = resumo(selecionados(), st.marcas);
  $('sTotal').textContent = r.total;
  $('sP').textContent = r.presentes;
  $('sF').textContent = r.faltas;
  $('sN').textContent = r.pendentes;
  $('pct').textContent = r.total ? `${Math.round(((r.presentes + r.faltas) / r.total) * 100)}%` : '0%';
  const C = 2 * Math.PI * 32;
  const ok = r.total ? (r.presentes / r.total) * C : 0;
  const bad = r.total ? (r.faltas / r.total) * C : 0;
  $('ringOk').setAttribute('stroke-dasharray', `${ok} ${C}`);
  $('ringBad').setAttribute('stroke-dasharray', `${bad} ${C}`);
  $('ringBad').setAttribute('stroke-dashoffset', `${-ok}`);
}

function marcar(chave, status) {
  const m = (st.marcas[chave] ||= { status: '', obs: '' });
  m.status = m.status === status ? '' : status; // tocar de novo desmarca
  st.conferidoEm = new Date().toLocaleString('pt-BR');
  vibrar(m.status === 'F' ? [12, 40, 12] : 10);
  const el = document.querySelector(`.p[data-k="${chave}"]`);
  if (el) el.dataset.st = m.status;
  const si = Number(chave.split('_')[0]);
  const cnt = document.querySelector(`[data-cnt="${si}"]`);
  if (cnt) cnt.textContent = contagem(selecionados().filter((p) => p.secao === si));
  salvar();
  renderResumo();
  if (vista !== 'todos') setTimeout(renderLista, 420);
}

// ---------- Eventos ----------
$('file').addEventListener('change', (e) => { abrir(e.target.files[0]); e.target.value = ''; });
$('trocar').addEventListener('click', () => $('file').click());
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); abrir(e.dataTransfer.files[0]); });

$('btnDados').addEventListener('click', () => $('dlgDados').showModal());
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
}
for (const k of ['titulo', 'subtitulo', 'responsavel', 'emitente']) {
  $(k).addEventListener('input', () => { st.meta[k] = $(k).value; renderCabecalho(); salvar(); });
}

function mudouSelecao() {
  st.sel.sort((a, b) => a - b);
  st.meta.subtitulo = sugerirSubtitulo();
  st.meta.responsavel = sugerirResponsavel();
  $('subtitulo').value = st.meta.subtitulo;
  $('responsavel').value = st.meta.responsavel;
  salvar();
  renderSecoes();
  renderLista();
}
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]');
  if (!b) return;
  st.sel = [...gruposAtuais[Number(b.dataset.g)].idx];
  vibrar(8);
  mudouSelecao();
});
$('secs').addEventListener('change', (e) => {
  const i = Number(e.target.dataset.sec);
  st.sel = e.target.checked ? [...new Set([...st.sel, i])] : st.sel.filter((x) => x !== i);
  mudouSelecao();
});
$('aplicarFiltro').addEventListener('click', () => {
  const termo = $('filtro').value.trim().toUpperCase();
  if (!termo) return;
  const achadas = st.escala.secoes.map((s, i) => (s.titulo.toUpperCase().includes(termo) ? i : -1)).filter((i) => i >= 0);
  if (!achadas.length) { aviso(`Nenhuma seção contém "${termo}".`, 'err'); return; }
  st.sel = achadas;
  mudouSelecao();
  aviso(`${achadas.length} seção(ões) com "${termo}".`);
});
$('filtro').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('aplicarFiltro').click(); });
$('selTodas').addEventListener('click', () => { st.sel = st.escala.secoes.map((_, i) => i); mudouSelecao(); });
$('selNenhuma').addEventListener('click', () => { st.sel = []; mudouSelecao(); });

$('vista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  vista = b.dataset.v;
  for (const x of $('vista').children) x.setAttribute('aria-pressed', String(x === b));
  renderLista();
});
$('busca').addEventListener('input', renderLista);
$('lista').addEventListener('click', (e) => {
  const linha = e.target.closest('.p');
  const alvo = e.target.closest('button');
  if (!linha || !alvo) return;
  const k = linha.dataset.k;
  if (alvo.dataset.act) marcar(k, alvo.dataset.act);
  if (alvo.hasAttribute('data-addobs')) { linha.classList.add('open'); linha.querySelector('.obs').focus(); }
  if (alvo.dataset.chip) {
    const inp = linha.querySelector('.obs');
    inp.value = inp.value ? `${inp.value}; ${alvo.dataset.chip}` : alvo.dataset.chip;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
  }
});
$('lista').addEventListener('input', (e) => {
  if (!e.target.classList.contains('obs')) return;
  const k = e.target.closest('.p').dataset.k;
  (st.marcas[k] ||= { status: '', obs: '' }).obs = e.target.value;
  salvar();
});
$('todosP').addEventListener('click', () => {
  const pend = selecionados().filter((p) => !st.marcas[p.chave]?.status);
  if (!pend.length) { aviso('Não há ninguém a conferir.'); return; }
  const antes = JSON.stringify(st.marcas);
  for (const p of pend) (st.marcas[p.chave] ||= { status: '', obs: '' }).status = 'P';
  st.conferidoEm = new Date().toLocaleString('pt-BR');
  vibrar(14);
  salvar();
  renderLista();
  aviso(`${pend.length} marcado(s) como presente(s).`, 'info', {
    rotulo: 'Desfazer',
    fn: () => { st.marcas = JSON.parse(antes); salvar(); renderLista(); },
  });
});
$('limpar').addEventListener('click', () => {
  if (!confirm('Começar uma nova conferência? A escala e as marcações atuais serão apagadas deste aparelho.')) return;
  const emitente = st.meta.emitente;
  st = novoEstado();
  st.meta.emitente = emitente;
  salvar();
  renderTudo();
});

// Seções selecionadas com as marcações da conferência aplicadas a cada policial.
function secoesComMarcas(lista) {
  return st.sel.map((si) => ({
    ...st.escala.secoes[si],
    policiais: lista.filter((p) => p.secao === si).map((p) => ({ ...p, ...(st.marcas[p.chave] || {}) })),
  }));
}

function baixar(conteudo, nome, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------- Extrato (release) ----------
const CHAVE_GUERRA = 'conferencia-guerra-v1';
let baseGuerra = null; // { sal, nomes: { hash(matrícula): NOME } } — sem nomes completos nem matrículas
const guerraPorMatricula = {};
function guerraLocal() {
  try { return JSON.parse(localStorage.getItem(CHAVE_GUERRA)) || {}; } catch { return {}; }
}
async function hashMatricula(m) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(baseGuerra.sal + m));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
async function prepararGuerra(lista) {
  if (!baseGuerra) baseGuerra = await fetch('nomes-guerra.json').then((r) => r.json()).catch(() => ({ sal: '', nomes: {} }));
  if (!crypto.subtle) return;
  for (const p of lista) {
    if (p.matricula && !(p.matricula in guerraPorMatricula)) guerraPorMatricula[p.matricula] = baseGuerra.nomes[await hashMatricula(p.matricula)] || null;
  }
}
function nomeDeGuerra(p) {
  const local = guerraLocal();
  if (p.matricula) return local[p.matricula] || guerraPorMatricula[p.matricula] || null;
  // Substituto digitado por nome completo: procura a matrícula na escala carregada.
  const achado = st.escala.secoes.flatMap((s) => s.policiais).find((q) => q.nome === p.nome);
  return achado ? local[achado.matricula] || guerraPorMatricula[achado.matricula] || null : (local[p.nome] || null);
}
function montarRelease() {
  const { texto, faltando } = gerarRelease(
    { ...st.meta, comando: st.escala.comando, unidade: st.escala.unidade, secoes: secoesComMarcas(selecionados()) },
    { guerra: nomeDeGuerra, vtr: st.meta.vtr },
  );
  $('relTexto').value = texto;
  const box = $('relFaltando');
  box.classList.toggle('hidden', !faltando.length);
  box.innerHTML = faltando.length ? `<b>Nome de guerra não cadastrado (${faltando.length})</b>Informe uma vez; fica salvo neste aparelho.`
    + faltando.map((f) => `<label><span>${esc(f.nome)}</span><input type="text" data-guerra="${esc(f.matricula || f.nome)}" placeholder="Nome de guerra"></label>`).join('') : '';
}

$('release').addEventListener('click', async () => {
  if (!selecionados().length) { aviso('Selecione ao menos uma seção.', 'err'); return; }
  await prepararGuerra(st.escala.secoes.flatMap((s) => s.policiais));
  $('relVtr').value = st.meta.vtr || '';
  montarRelease();
  $('dlgRelease').showModal();
});
$('relFechar').addEventListener('click', () => $('dlgRelease').close());
$('relVtr').addEventListener('change', () => { st.meta.vtr = $('relVtr').value.trim(); salvar(); montarRelease(); });
$('relFaltando').addEventListener('change', (e) => {
  const k = e.target.dataset.guerra;
  if (!k || !e.target.value.trim()) return;
  const local = guerraLocal();
  local[k] = e.target.value.trim().toUpperCase();
  try { localStorage.setItem(CHAVE_GUERRA, JSON.stringify(local)); } catch { /* armazenamento indisponível */ }
  montarRelease();
});
$('relCopiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('relTexto').value);
  } catch {
    $('relTexto').select();
    document.execCommand('copy');
  }
  vibrar(10);
  aviso('Extrato copiado. Cole no grupo do WhatsApp.');
});
$('relWhats').addEventListener('click', () => {
  window.open(`https://wa.me/?text=${encodeURIComponent($('relTexto').value)}`, '_blank', 'noopener');
});
$('relBaixar').addEventListener('click', () => {
  baixar($('relTexto').value, `Release-${slug(st.meta.subtitulo || st.meta.titulo) || 'Escala'}.txt`, 'text/plain;charset=utf-8');
});

// ---------- PDF ----------
$('gerar').addEventListener('click', async () => {
  const lista = selecionados();
  if (!lista.length) { aviso('Selecione ao menos uma seção.', 'err'); return; }
  const btn = $('gerar');
  btn.disabled = true;
  try {
    const secoes = secoesComMarcas(lista);
    const datas = [...new Set(secoes.map((s) => s.data))];
    const horarios = [...new Set(secoes.map((s) => `${s.horaInicio} às ${s.horaFim}`))];
    const brasao = await fetch('brasao.png').then((r) => r.arrayBuffer()).catch(() => null);
    const { bytes, nome } = await gerarPdf({
      ...st.meta,
      comando: st.escala.comando,
      unidade: st.escala.unidade,
      data: datas.join(' e '),
      servico: horarios.length === 1 ? horarios[0] : 'conforme seções',
      total: lista.length,
      secoes,
      resumo: resumo(lista, st.marcas),
      conferidoEm: st.conferidoEm,
      brasao,
    });
    baixar(bytes, nome, 'application/pdf');
    const r = resumo(lista, st.marcas);
    aviso(`PDF gerado · ${r.presentes} presentes, ${r.faltas} faltas, ${r.pendentes} a conferir.`);
  } catch (e) {
    console.error(e);
    aviso(`Erro ao gerar o PDF: ${e.message}`, 'err');
  } finally {
    btn.disabled = false;
  }
});

// Instalação e uso sem internet (exige https ou localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

renderTudo();
