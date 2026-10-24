// Release (extrato da operação) em texto no padrão de WhatsApp, a partir das seções da conferência.
//
// *POLÍCIA MILITAR DA BAHIA*
// *COPPM / CPRC-BTS*
// *18° BPM*
// *Operação Eleição*
// *Extrato da Operação Eleição/2026*
// *Data*: 04/10/2026  (domingo)
// *Horário:* 12h às 18h
// Coordenador: Ten PM *Marco Antonio*
// *1 - Colégio Manoel Novaes*
// SD PM *Brito*
// *RESUMO:* ...
// *PMBA, uma Força a serviço do cidadão!*

const RE_COORD = /COORDENA|^COMANDANTE\b|COMANDANTE DO|SUPERVIS|COMANDO DO SETOR/i;
const RE_GRUPO = /^(SETOR\s+\d+[A-Z]?)\b/i;
const RE_POSTO = /^((?:\d+\s*[º°ª]\s*)?(?:TEN\s+CEL|SUB\s*TEN|CEL|MAJ|CAP|TEN|ASP(?:\s+OF)?|SGT|CB|SD|ST)\s+PM)\s+(.+)$/i;
const OFICIAIS = /^(\d+\s*[º°]\s*)?(TEN\s+CEL|CEL|MAJ|CAP|TEN|ASP)/i;
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'na', 'no', 'à', 'ao', 'por', 'para']);
const SIGLAS = /^(UFBA|UNEB|IFBA|PM|BPM|CPRC|BTS|SAC|SSP|TRE|BR|II|III|IV|[A-Z]{2,5}-\d+)$/;
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function tituloCaso(s) {
  return String(s || '').toLowerCase().split(/(\s+|\/|-)/).map((w, i) => {
    if (!w.trim() || /^[-/]$/.test(w)) return w;
    const [, abre, miolo] = w.match(/^([("']*)(.*)$/);
    if (SIGLAS.test(miolo.toUpperCase())) return abre + miolo.toUpperCase();
    if (i > 0 && !abre && MINUSCULAS.has(miolo)) return w;
    return abre + miolo.charAt(0).toUpperCase() + miolo.slice(1);
  }).join('');
}

// Separa "SD PM FULANO DE TAL" em posto/graduação e nome.
export function separarPosto(nome) {
  const m = String(nome || '').trim().match(RE_POSTO);
  return m ? { posto: m[1].replace(/\s+/g, ' '), resto: m[2].trim() } : { posto: '', resto: String(nome || '').trim() };
}

// Oficiais em caixa de título ("Ten PM", "Cap PM"); praças como na escala ("SD PM", "SGT PM").
export function formatarPosto(posto) {
  const p = posto.replace(/º/g, '°');
  if (!OFICIAIS.test(p)) return p.toUpperCase();
  return p.split(' ').map((w) => (w === 'PM' || /^\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
}

// Se a observação registrar "Substituído por FULANO", o release traz o substituto.
export function substituto(p) {
  const m = (p.obs || '').match(/substitu[íi]d[oa]\s+por\s*:?\s*([^;]+)/i);
  return m && m[1].trim() ? m[1].trim().toUpperCase() : null;
}

function horaCurta(h) {
  return String(h || '').replace(/h00$/i, 'h');
}

function diaDaSemana(data) {
  const [d, m, a] = String(data).split('/').map(Number);
  if (!d || !m || !a) return '';
  return DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

function rotuloFuncao(f) {
  const t = (f || '').trim();
  if (/^(comandante|coordenador)$/i.test(t)) return 'Coordenador';
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Policial';
}

// Local do posto: tira o grupo ("SETOR 3 - ") e a modalidade ("PO A PÉ - ", "TARDE - ").
function localDoPosto(titulo, grupo) {
  let t = titulo;
  if (grupo) t = t.replace(new RegExp(`^${grupo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i'), '');
  t = t.replace(/^(TARDE|MANH[ÃA]|NOITE)\s*-\s*/i, '').replace(/^PO\b[^-]*-\s*/i, '');
  return t.trim();
}

// "ELEIÇÃO 2026" -> { nome: "Eleição", ano: "2026" }; tira "Operação" do início para não repetir.
function nomeOperacao(titulo) {
  const t = String(titulo || '').trim();
  const ano = (t.match(/\b(20\d{2})\b/) || [])[1] || '';
  const nome = t.replace(/\b20\d{2}\b/, '').replace(/^OPERA[ÇC][ÃA]O\s+/i, '').replace(/[\s\-–/]+$/, '').trim();
  return { nome: tituloCaso(nome), ano };
}

/**
 * dados: { comando, unidade, titulo, secoes: [{ titulo, data, horaInicio, horaFim, policiais: [{ nome, matricula, funcao, status, obs }] }] }
 * opcoes.guerra(p): nome de guerra do policial ({ nome, matricula }) ou null.
 * opcoes.vtr: prefixo da viatura (opcional).
 * Retorna { texto, faltando }: faltando lista quem saiu sem nome de guerra.
 */
export function gerarRelease(dados, opcoes = {}) {
  const guerra = opcoes.guerra || (() => null);
  const faltando = new Map();
  const L = [];

  const pessoa = (p) => {
    const sub = substituto(p);
    const base = sub ? { nome: sub, matricula: '' } : p;
    const { posto, resto } = separarPosto(base.nome);
    let g = guerra(base);
    if (!g && sub && resto.split(/\s+/).length <= 2) g = resto; // substituto digitado já pelo nome de guerra
    if (!g) {
      faltando.set(base.matricula || base.nome, { matricula: base.matricula, nome: base.nome });
      g = resto;
    }
    const falta = p.status === 'F' && !sub ? ' (falta)' : '';
    return `${posto ? formatarPosto(posto) + ' ' : ''}*${tituloCaso(g)}*${falta}`;
  };

  L.push('*POLÍCIA MILITAR DA BAHIA*');
  const cmd = (dados.comando || '').replace(/\s*-\s*/g, '-');
  if (cmd) L.push(`*COPPM / ${cmd}*`);
  const bpm = (dados.unidade || '').split(/\s+-\s+/)[0].replace(/º/g, '°');
  if (bpm) L.push(`*${bpm}*`);
  L.push('', '');
  const op = nomeOperacao(dados.titulo);
  if (op.nome) {
    L.push(`*Operação ${op.nome}*`, '', '');
    L.push(`*Extrato da Operação ${op.nome}${op.ano ? '/' + op.ano : ''}*`, '');
  }

  const datas = [...new Set(dados.secoes.map((s) => s.data))];
  const horarios = [...new Set(dados.secoes.map((s) => `${horaCurta(s.horaInicio)} às ${horaCurta(s.horaFim)}`))];
  if (datas.length === 1) L.push(`*Data*: ${datas[0]}  (${diaDaSemana(datas[0])})`);
  if (horarios.length === 1) L.push(`*Horário:* ${horarios[0]}`);
  L.push('');

  // Blocos por setor e turno; com um bloco só, sem cabeçalho de setor (como no modelo).
  const blocos = new Map();
  for (const s of dados.secoes) {
    const g = (s.titulo.match(RE_GRUPO) || [])[1]?.toUpperCase() || '';
    const hora = `${horaCurta(s.horaInicio)} às ${horaCurta(s.horaFim)}`;
    const chave = `${g}|${s.data}|${hora}`;
    if (!blocos.has(chave)) blocos.set(chave, { g, data: s.data, hora, coord: [], postos: [] });
    blocos.get(chave)[RE_COORD.test(s.titulo) ? 'coord' : 'postos'].push(s);
  }
  const varios = blocos.size > 1;

  [...blocos.values()].forEach((b, bi) => {
    if (varios) {
      const partes = [b.g ? tituloCaso(b.g) : '', datas.length > 1 ? b.data : '', horarios.length > 1 ? b.hora : ''].filter(Boolean);
      L.push(`*${partes.join(' – ') || `Bloco ${bi + 1}`}*`);
    }
    for (const s of b.coord) for (const p of s.policiais) L.push(`${rotuloFuncao(p.funcao)}: ${pessoa(p)}`);
    const vtr = opcoes.vtr && bi === 0;
    if (vtr) L.push(`Vtr: ${opcoes.vtr}`);
    if (b.coord.length || vtr) L.push('');
    b.postos.forEach((s, i) => {
      L.push(`*${i + 1} - ${tituloCaso(localDoPosto(s.titulo, b.g))}*`);
      for (const p of s.policiais) L.push(pessoa(p));
      L.push('', '');
    });
  });

  // Resumo a partir da conferência.
  const todos = dados.secoes.flatMap((s) => s.policiais);
  const faltas = todos.filter((p) => p.status === 'F').length;
  const repostos = todos.filter((p) => p.status === 'F' && substituto(p)).length;
  const atrasos = todos.filter((p) => /atras/i.test(p.obs || '')).length;
  const pendentes = todos.filter((p) => !p.status).length;
  const dd = (n) => String(n).padStart(2, '0');
  L.push('*RESUMO:*');
  L.push(`Efetivo previsto: ${dd(todos.length)}`);
  L.push(`Efetivo ativo: ${dd(todos.length - faltas + repostos)}`);
  L.push(`Faltas: ${dd(faltas)}`);
  L.push(`Atrasos: ${dd(atrasos)}`);
  if (pendentes) L.push(`Não conferidos: ${dd(pendentes)}`);
  L.push('', '');
  L.push('*PMBA, uma Força a serviço do cidadão!*');

  const texto = L.join('\n').replace(/\n{4,}/g, '\n\n\n') + '\n';
  return { texto, faltando: [...faltando.values()] };
}
