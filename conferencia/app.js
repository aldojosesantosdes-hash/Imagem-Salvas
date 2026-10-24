import { linhasDeItens, interpretarEscala, sufixoComum, efetivo, resumo, slug } from './parser.js';
import { gerarPdf, lerMarcacoes } from './gerar-pdf.js';
import { gerarRelease } from './release.js';

const CHAVE = 'conferencia-presenca-v1';
const $ = (id) => document.getElementById(id);
window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

let st = carregar() || novoEstado();

function novoEstado() {
  return { escala: null, sel: [], marcas: {}, meta: { titulo: '', subtitulo: '', responsavel: '', emitente: '' }, conferidoEm: '' };
}
function carregar() {
  try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch { /* armazenamento indisponível */ }
}
function aviso(texto, tipo = 'info') {
  const el = $('msg');
  el.textContent = texto;
  el.className = `msg ${tipo}`;
  el.classList.toggle('hidden', !texto);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
      aviso('Não encontrei seções de escala neste PDF. Ele precisa ter texto selecionável (não pode ser foto/digitalização) e blocos no formato "FUNÇÃO - DATA: dd/mm/aaaa, DE 00h00 ÀS 00h00" seguidos da tabela Nome / Matrícula / Função.', 'err');
      return;
    }
    const anterior = st.meta.emitente;
    st = novoEstado();
    st.escala = escala;
    st.sel = escala.secoes.map((_, i) => i);
    st.meta.titulo = escala.titulo;
    st.meta.subtitulo = escala.subtitulo;
    st.meta.emitente = anterior;
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
    salvar();
    renderTudo();
    const total = escala.secoes.reduce((n, s) => n + s.policiais.length, 0);
    aviso(`${escala.secoes.length} seções e ${total} policiais lidos de "${arquivo.name}".`
      + (recuperadas ? ` ${recuperadas} marcações recuperadas da conferência anterior.` : ' Selecione as seções do seu posto abaixo.'));
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
  const cmd = lista.find((p) => /comandante/i.test(p.funcao));
  return (cmd || lista[0] || {}).nome || '';
}
function sugerirSubtitulo() {
  const titulos = st.sel.map((i) => st.escala.secoes[i].titulo);
  const suf = sufixoComum(titulos);
  // "PORTAL ..." quando as seções são de um portal de abordagem, como no modelo.
  return suf && !/PORTAL/i.test(suf) && titulos.some((t) => /PORTAL/i.test(t)) ? `PORTAL ${suf}` : suf;
}

// ---------- Renderização ----------
function renderTudo() {
  const tem = !!st.escala;
  $('setup').classList.toggle('hidden', !tem);
  $('conf').classList.toggle('hidden', !tem);
  $('foot').classList.toggle('hidden', !tem);
  $('drop').querySelector('strong').textContent = tem ? 'Trocar escala (PDF)' : 'Carregar escala (PDF)';
  if (!tem) { $('hdrSub').textContent = 'Carregue a escala em PDF para começar'; return; }
  for (const k of ['titulo', 'subtitulo', 'responsavel', 'emitente']) $(k).value = st.meta[k] || '';
  renderSecoes();
  renderLista();
}

function renderSecoes() {
  $('secs').innerHTML = st.escala.secoes.map((s, i) => `
    <label><input type="checkbox" data-sec="${i}" ${st.sel.includes(i) ? 'checked' : ''}>
      <span>${esc(s.titulo)}<small>${esc(s.data)}, ${esc(s.horaInicio)} às ${esc(s.horaFim)} · ${s.policiais.length} policial(is)</small></span>
    </label>`).join('');
}

function renderLista() {
  const lista = selecionados();
  const termo = $('busca').value.trim().toUpperCase();
  const grupos = new Map();
  for (const p of lista) {
    if (termo && !p.nome.toUpperCase().includes(termo) && !p.matricula.includes(termo)) continue;
    if (!grupos.has(p.secao)) grupos.set(p.secao, []);
    grupos.get(p.secao).push(p);
  }
  $('lista').innerHTML = [...grupos].map(([si, ps]) => {
    const s = st.escala.secoes[si];
    return `<div class="group-title">${esc(s.titulo)}<small>${esc(s.data)}, de ${esc(s.horaInicio)} às ${esc(s.horaFim)}</small></div>
      <div class="people">${ps.map(linhaHtml).join('')}</div>`;
  }).join('') || '<p class="muted" style="margin-top:16px">Nenhum policial nas seções selecionadas.</p>';
  $('hdrSub').textContent = [st.meta.titulo, st.meta.subtitulo].filter(Boolean).join(' · ');
  renderResumo();
}

function linhaHtml(p) {
  const m = st.marcas[p.chave] || {};
  return `<div class="p" data-k="${p.chave}" data-st="${m.status || ''}">
    <div class="who">
      <div><div class="name ${/comandante/i.test(p.funcao) ? 'cmd' : ''}">${esc(p.nome)}</div>
        <div class="meta">${esc(p.matricula)} · ${esc(p.funcao)}</div></div>
      <div class="acts">
        <button class="bP" data-act="P" type="button" aria-label="Presente">P</button>
        <button class="bF" data-act="F" type="button" aria-label="Falta">F</button>
      </div>
    </div>
    <input class="obs" type="text" placeholder="Observação (atraso, substituição…)" value="${esc(m.obs)}">
    <div class="chips"><button type="button" data-chip="Atraso">Atraso</button><button type="button" data-chip="Substituído por ">Substituição</button><button type="button" data-chip="Dispensado">Dispensado</button></div>
  </div>`;
}

function renderResumo() {
  const r = resumo(selecionados(), st.marcas);
  $('sTotal').textContent = r.total;
  $('sP').textContent = r.presentes;
  $('sF').textContent = r.faltas;
  $('sN').textContent = r.pendentes;
  $('barP').style.width = r.total ? `${(r.presentes / r.total) * 100}%` : '0';
  $('barF').style.width = r.total ? `${(r.faltas / r.total) * 100}%` : '0';
}

function marcar(chave, status) {
  const m = (st.marcas[chave] ||= { status: '', obs: '' });
  m.status = m.status === status ? '' : status; // tocar de novo desmarca
  st.conferidoEm = new Date().toLocaleString('pt-BR');
  const el = document.querySelector(`.p[data-k="${chave}"]`);
  if (el) el.dataset.st = m.status;
  salvar();
  renderResumo();
}

// ---------- Eventos ----------
$('file').addEventListener('change', (e) => { abrir(e.target.files[0]); e.target.value = ''; });
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); abrir(e.dataTransfer.files[0]); });

for (const k of ['titulo', 'subtitulo', 'responsavel', 'emitente']) {
  $(k).addEventListener('input', () => {
    st.meta[k] = $(k).value;
    $('hdrSub').textContent = [st.meta.titulo, st.meta.subtitulo].filter(Boolean).join(' · ');
    salvar();
  });
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
$('secs').addEventListener('change', (e) => {
  const i = Number(e.target.dataset.sec);
  st.sel = e.target.checked ? [...new Set([...st.sel, i])] : st.sel.filter((x) => x !== i);
  mudouSelecao();
});
$('aplicarFiltro').addEventListener('click', () => {
  const termo = $('filtro').value.trim().toUpperCase();
  if (!termo) return;
  st.sel = st.escala.secoes.map((s, i) => (s.titulo.toUpperCase().includes(termo) ? i : -1)).filter((i) => i >= 0);
  mudouSelecao();
  aviso(st.sel.length ? `${st.sel.length} seção(ões) contêm "${termo}".` : `Nenhuma seção contém "${termo}".`, st.sel.length ? 'info' : 'err');
});
$('filtro').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('aplicarFiltro').click(); });
$('selTodas').addEventListener('click', () => { st.sel = st.escala.secoes.map((_, i) => i); mudouSelecao(); });
$('selNenhuma').addEventListener('click', () => { st.sel = []; mudouSelecao(); });

$('busca').addEventListener('input', renderLista);
$('lista').addEventListener('click', (e) => {
  const linha = e.target.closest('.p');
  if (!linha) return;
  const k = linha.dataset.k;
  if (e.target.dataset.act) marcar(k, e.target.dataset.act);
  if (e.target.dataset.chip) {
    const inp = linha.querySelector('.obs');
    inp.value = inp.value ? `${inp.value}; ${e.target.dataset.chip}` : e.target.dataset.chip;
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
  if (!pend.length) return;
  if (!confirm(`Marcar ${pend.length} policial(is) ainda não conferido(s) como presente(s)?`)) return;
  for (const p of pend) (st.marcas[p.chave] ||= { status: '', obs: '' }).status = 'P';
  st.conferidoEm = new Date().toLocaleString('pt-BR');
  salvar();
  renderLista();
});
$('limpar').addEventListener('click', () => {
  if (!confirm('Apagar a escala e as marcações desta conferência?')) return;
  const emitente = st.meta.emitente;
  st = novoEstado();
  st.meta.emitente = emitente;
  salvar();
  aviso('');
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

// ---------- Release ----------
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
  box.innerHTML = faltando.length ? `<b>Sem nome de guerra cadastrado (${faltando.length}) — informe para sair no padrão:</b>`
    + faltando.map((f) => `<label><span>${esc(f.nome)}</span><input type="text" data-guerra="${esc(f.matricula || f.nome)}" placeholder="Nome de guerra"></label>`).join('') : '';
}

$('release').addEventListener('click', async () => {
  const lista = selecionados();
  if (!lista.length) { aviso('Selecione ao menos uma seção.', 'err'); return; }
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
  const btn = $('relCopiar');
  try {
    await navigator.clipboard.writeText($('relTexto').value);
  } catch {
    $('relTexto').select();
    document.execCommand('copy');
  }
  btn.textContent = 'Copiado ✓';
  setTimeout(() => { btn.textContent = 'Copiar'; }, 1800);
});
$('relWhats').addEventListener('click', () => {
  window.open(`https://wa.me/?text=${encodeURIComponent($('relTexto').value)}`, '_blank', 'noopener');
});
$('relBaixar').addEventListener('click', () => {
  baixar($('relTexto').value, `Release-${slug(st.meta.subtitulo || st.meta.titulo) || 'Escala'}.txt`, 'text/plain;charset=utf-8');
});

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
    aviso(`PDF "${nome}" gerado: ${r.presentes} presentes, ${r.faltas} faltas, ${r.pendentes} não conferidos.`);
  } catch (e) {
    console.error(e);
    aviso(`Erro ao gerar o PDF: ${e.message}`, 'err');
  } finally {
    btn.disabled = false;
  }
});

renderTudo();
