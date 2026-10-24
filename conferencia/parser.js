// Leitura de escalas SISGESPOL (e de conferências já geradas) a partir do texto do PDF.
// Lógica pura: recebe itens de texto com posição e devolve a estrutura da escala.

const RE_MATRICULA = /^\d{6,10}$/;
const RE_SECAO = /^(.*?)\s*-?\s*DATA:\s*(\d{2}\/\d{2}\/\d{4}),?\s*DE\s+(\d{1,2}h\d{2})\s+(?:ÀS|AS|ÁS|A)\s+(\d{1,2}h\d{2})/i;
const RE_DATA_SOLTA = /^(\d{2}\/\d{2}\/\d{4}),?\s*DE\s+(\d{1,2}h\d{2})\s+(?:ÀS|AS|ÁS|A)\s+(\d{1,2}h\d{2})\s*$/i;
const RE_CABECALHO_TABELA = /^Nome\s+Matr[íi]cula/i;
const RE_IGNORAR = /^(PRESCRI[ÇC][ÕO]ES:?|POL[ÍI]CIA MILITAR DA BAHIA|CONFER[ÊE]NCIA DIGITAL DE PRESEN[ÇC]A.*|C[ÓO]PIA CONTROLADA.*|Marque a presen.*|Confer[êe]ncia do comandante.*|\d+ grupos? organizados.*|.*P[áa]gina \d+ de \d+)$/i;
const RE_TURNO = /^TURNO\s+(\d{2}\/\d{2}\/\d{4})\s*[·,\-–]?\s*(\d{1,2}h\d{2})\s+(?:ÀS|AS|ÁS|A)\s+(\d{1,2}h\d{2})/i;
const RE_SUBTITULO_CONF = /^CONFER[ÊE]NCIA DIGITAL DE PRESEN[ÇC]A\s*[—–-]\s*(.+)$/i;

// Agrupa itens ({str, x, y, w}) em linhas, da mais alta para a mais baixa (y do PDF cresce para cima).
export function linhasDeItens(itens, tolY = 2.5) {
  const validos = itens.filter((i) => i.str && i.str.trim() !== '');
  validos.sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas = [];
  for (const it of validos) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima.y - it.y) <= tolY) ultima.itens.push(it);
    else linhas.push({ y: it.y, itens: [it] });
  }
  return linhas.map((l) => {
    l.itens.sort((a, b) => a.x - b.x);
    let texto = '';
    let fim = null;
    for (const it of l.itens) {
      // Itens colados (ex.: nome de guerra em negrito no meio do nome) não ganham espaço extra.
      const lacuna = fim === null ? 0 : it.x - fim;
      if (fim !== null && lacuna > 1 && !texto.endsWith(' ') && !it.str.startsWith(' ')) texto += ' ';
      texto += it.str;
      fim = it.x + (it.w || 0);
    }
    return { y: l.y, x: l.itens[0].x, texto: texto.replace(/\s+/g, ' ').trim(), itens: l.itens };
  });
}

// Divide uma linha de tabela em nome, matrícula e função.
function linhaPolicial(linha) {
  const m = linha.texto.match(/^(.+?)\s+(\d{6,10})(?:\s+(.*))?$/);
  if (!m || /\d/.test(m[1].replace(/\d+º|\d+ª/g, ''))) return null;
  return { nome: m[1].trim(), matricula: m[2], funcao: (m[3] || '').trim() };
}

function cabecalhoDoc(linhas) {
  const cab = { comando: '', unidade: '', titulo: '', subtitulo: '' };
  const livres = [];
  for (const l of linhas) {
    const t = l.texto;
    if (RE_IGNORAR.test(t) || /^DATA:/i.test(t) || /^RESPONS[ÁA]VEL:/i.test(t)) continue;
    if (t.includes('|') && /BPM/i.test(t)) {
      const [a, b] = t.split('|').map((s) => s.trim());
      cab.comando = a; cab.unidade = b;
    } else if (!cab.unidade && /\bBPM\b|BATALH/i.test(t)) cab.unidade = t;
    else if (!cab.comando && /^CP[A-Z]|COMANDO|^CPR/i.test(t)) cab.comando = t;
    else livres.push(t);
  }
  cab.titulo = livres[0] || '';
  cab.subtitulo = livres[1] || '';
  return cab;
}

export function interpretarEscala(linhas) {
  const secoes = [];
  const antesDaPrimeira = [];
  let atual = null;
  let colFuncao = null;
  let soltas = []; // linhas sem estrutura desde a última tabela (títulos quebrados, nomes de grupo)
  let grupo = null; // formato por setor: "SETOR 1" + "TURNO dd/mm/aaaa · 07h00 ÀS 13h00"
  let subtituloConf = '';

  const consumir = (usadas) => {
    for (const u of usadas) {
      const k = antesDaPrimeira.indexOf(u);
      if (k >= 0) antesDaPrimeira.splice(k, 1);
    }
    soltas = [];
  };
  const novaSecao = (titulo, data, horaInicio, horaFim) => {
    atual = { titulo, data, horaInicio, horaFim, policiais: [] };
    secoes.push(atual);
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    let t = linha.texto;
    const sub = t.match(RE_SUBTITULO_CONF);
    if (sub && !subtituloConf) subtituloConf = sub[1].trim();
    if (RE_IGNORAR.test(t)) { soltas = []; continue; }

    // Cabeçalho de seção quebrado em duas linhas ("... DE 13h00" / "ÀS 21h00").
    if (/DATA:/i.test(t) && !RE_SECAO.test(t) && linhas[i + 1]) {
      const junto = `${t} ${linhas[i + 1].texto}`;
      if (RE_SECAO.test(junto)) { t = junto; i++; }
    }

    let m = t.match(RE_SECAO);
    if (m) {
      // Título longo quebrado em várias linhas acima de "... - DATA:": sobe enquanto as linhas estiverem coladas.
      const usadas = [];
      let ref = linha;
      for (let k = soltas.length - 1; k >= 0; k--) {
        const s = soltas[k];
        const gap = s.y - ref.y;
        if (gap <= 0 || gap > 13 || Math.abs(s.x - linha.x) > 3) break;
        usadas.unshift(s);
        ref = s;
      }
      let titulo = [...usadas.map((u) => u.texto), m[1].replace(/\s*-\s*$/, '').trim()].filter(Boolean).join(' ');
      if (!titulo && soltas.length) { usadas.push(soltas[soltas.length - 1]); titulo = usadas[0].texto; }
      novaSecao(titulo, m[2], m[3], m[4]);
      consumir(usadas);
      continue;
    }
    m = t.match(RE_TURNO);
    if (m) {
      const nome = soltas.length ? soltas[soltas.length - 1] : null;
      grupo = { nome: nome ? nome.texto.replace(/\s+\d+\s+PMs?$/i, '').trim() : '', data: m[1], horaInicio: m[2], horaFim: m[3] };
      consumir(nome ? [nome] : []);
      continue;
    }
    m = t.match(RE_DATA_SOLTA);
    if (m && soltas.length) {
      // Formato da conferência: título numa barra, data na linha de baixo.
      const s = soltas[soltas.length - 1];
      novaSecao(s.texto, m[1], m[2], m[3]);
      consumir([s]);
      continue;
    }
    if (RE_CABECALHO_TABELA.test(t)) {
      const itF = linha.itens.find((it) => /^Fun[çc][ãa]o/i.test(it.str.trim()));
      colFuncao = itF ? itF.x : null;
      // Formato por setor: o título da equipe vem logo acima da tabela, sem data própria.
      if (grupo && soltas.length) {
        const s = soltas[soltas.length - 1];
        novaSecao(grupo.nome ? `${grupo.nome} - ${s.texto}` : s.texto, grupo.data, grupo.horaInicio, grupo.horaFim);
        consumir([s]);
      }
      soltas = [];
      continue;
    }

    const p = atual ? linhaPolicial(linha) : null;
    if (p) {
      atual.policiais.push(p);
      soltas = [];
      continue;
    }

    // Função que quebrou para a linha de baixo ("Coordenador" / "Operacional").
    const ult = atual && atual.policiais[atual.policiais.length - 1];
    if (ult && soltas.length === 0 && colFuncao !== null && Math.abs(linha.x - colFuncao) < 6 && !/\d/.test(t)) {
      ult.funcao = `${ult.funcao} ${t}`.trim();
      continue;
    }
    if (!atual) antesDaPrimeira.push(linha);
    soltas.push(linha);
  }

  const cab = cabecalhoDoc(antesDaPrimeira);
  if (!cab.subtitulo && subtituloConf) cab.subtitulo = subtituloConf;
  return { ...cab, secoes: secoes.filter((s) => s.policiais.length > 0) };
}

// Maior sequência de palavras finais comum aos títulos (ex.: "ALFREDO DE BRITO / BECO DO MOTA").
export function sufixoComum(titulos) {
  if (titulos.length === 0) return '';
  const partes = titulos.map((t) => t.toUpperCase().split(/\s+/).reverse());
  const comum = [];
  for (let k = 0; ; k++) {
    const w = partes[0][k];
    if (!w || partes.some((p) => p[k] !== w)) break;
    comum.push(w);
  }
  const s = comum.reverse().join(' ').replace(/^[-/|]\s*/, '');
  return s.split(' ').length >= 2 ? s : '';
}

export function slug(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .split('-').map((w) => (w.length > 2 || /\d/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join('-');
}

// Lista plana dos policiais selecionados, com chave estável e nome de campo único para o PDF.
export function efetivo(escala, indicesSecoes) {
  const usados = new Map();
  const lista = [];
  for (const si of indicesSecoes) {
    const s = escala.secoes[si];
    s.policiais.forEach((p, pi) => {
      const n = (usados.get(p.matricula) || 0) + 1;
      usados.set(p.matricula, n);
      lista.push({ ...p, secao: si, chave: `${si}_${pi}`, campo: n === 1 ? p.matricula : `${p.matricula}_${n}` });
    });
  }
  return lista;
}

export function resumo(lista, marcas) {
  const r = { total: lista.length, presentes: 0, faltas: 0, pendentes: 0 };
  for (const p of lista) {
    const st = marcas[p.chave]?.status;
    if (st === 'P') r.presentes++;
    else if (st === 'F') r.faltas++;
    else r.pendentes++;
  }
  return r;
}
