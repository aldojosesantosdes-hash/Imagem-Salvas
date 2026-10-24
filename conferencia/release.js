// Release em texto (padrão WhatsApp) a partir das seções da conferência.
//
// *CPRC-BTS   18ºBPM*
// *OPERAÇÃO ELEIÇÕES 2026*
// Comandante do Setor: CAP PM ...
// *Setor 3*
// Posto 01 - *Colégio Estadual Ursula Catharino*
// SGT PM ... E SD PM ...

const RE_COORD = /COORDENA|^COMANDANTE\b|COMANDANTE DO|SUPERVIS|COMANDO DO SETOR/i;
const RE_GRUPO = /^(SETOR\s+\d+[A-Z]?)\b/i;
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'na', 'no', 'à', 'ao', 'por', 'para']);
const SIGLAS = /^(UFBA|UNEB|IFBA|PM|BPM|CPRC|BTS|SAC|SSP|TRE|BR|II|III|IV|[A-Z]{2,5}-\d+)$/;

export function tituloCaso(s) {
  return String(s || '').toLowerCase().split(/(\s+|\/|-)/).map((w, i) => {
    if (!w.trim() || /^[-/]$/.test(w)) return w;
    const [, abre, miolo] = w.match(/^([("']*)(.*)$/);
    if (SIGLAS.test(miolo.toUpperCase())) return abre + miolo.toUpperCase();
    if (i > 0 && !abre && MINUSCULAS.has(miolo)) return w;
    return abre + miolo.charAt(0).toUpperCase() + miolo.slice(1);
  }).join('');
}

function juntarNomes(nomes) {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} E ${nomes[nomes.length - 1]}`;
}

// Nome efetivo: se a observação registrar "Substituído por FULANO", o release traz o substituto.
export function nomeEfetivo(p) {
  const m = (p.obs || '').match(/substitu[íi]d[oa]\s+por\s*:?\s*([^;]+)/i);
  return m && m[1].trim() ? m[1].trim().toUpperCase() : p.nome;
}

function rotuloFuncao(f, setor) {
  const t = (f || '').trim();
  if (setor && /^(comandante|coordenador)$/i.test(t)) return 'Comandante do Setor';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Policial';
}

// Local do posto: tira o grupo ("SETOR 3 - ") e a modalidade ("PO A PÉ - ", "TARDE - ").
function localDoPosto(titulo, grupo) {
  let t = titulo;
  if (grupo) t = t.replace(new RegExp(`^${grupo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i'), '');
  t = t.replace(/^(TARDE|MANH[ÃA]|NOITE)\s*-\s*/i, '').replace(/^PO\b[^-]*-\s*/i, '');
  return t.trim();
}

/**
 * dados: { comando, unidade, titulo, subtitulo, secoes: [{ titulo, data, horaInicio, horaFim, policiais: [{ nome, funcao, obs }] }] }
 */
export function gerarRelease(dados) {
  const linhas = [];
  const bpm = (dados.unidade || '').split(/\s+-\s+/)[0].replace(/\s+/g, '');
  const cmd = (dados.comando || '').replace(/\s*-\s*/g, '-');
  const topo = [cmd, bpm].filter(Boolean).join('   ');
  if (topo) linhas.push(`*${topo}*`, '');
  if (dados.titulo) linhas.push(`*${dados.titulo.toUpperCase()}*`);

  const datas = [...new Set(dados.secoes.map((s) => s.data))];
  const horarios = [...new Set(dados.secoes.map((s) => `${s.horaInicio} às ${s.horaFim}`))];
  if (datas.length) linhas.push(`_${datas.join(' e ')}${horarios.length === 1 ? ` · ${horarios[0]}` : ''}_`);
  linhas.push('');

  // Agrupa por "SETOR n" quando houver; senão, um grupo só com o subtítulo.
  // Com mais de um horário (manhã e tarde), cada turno vira um bloco próprio.
  const multiHorario = horarios.length > 1;
  const grupos = new Map();
  for (const s of dados.secoes) {
    const g = (s.titulo.match(RE_GRUPO) || [])[1]?.toUpperCase() || '';
    const hora = `${s.horaInicio} às ${s.horaFim}`;
    const chave = multiHorario ? `${g}|${s.data}|${hora}` : g;
    if (!grupos.has(chave)) grupos.set(chave, { g, hora: datas.length > 1 ? `${s.data} · ${hora}` : hora, coord: [], postos: [] });
    grupos.get(chave)[RE_COORD.test(s.titulo) ? 'coord' : 'postos'].push(s);
  }
  const variosGrupos = grupos.size > 1;

  const linhasCoord = (secs, setor) => secs.flatMap((s) => s.policiais.map((p) => `${rotuloFuncao(p.funcao, setor)}: ${nomeEfetivo(p)}`));

  for (const { g, hora, coord, postos } of grupos.values()) {
    const base = g ? tituloCaso(g) : (dados.subtitulo ? tituloCaso(dados.subtitulo) : '');
    const cabecalho = multiHorario ? [base, hora].filter(Boolean).join(' – ') : base;
    // Um grupo só: coordenação antes do cabeçalho do setor, como no modelo.
    if (!variosGrupos && coord.length) linhas.push(...linhasCoord(coord, !!g), '');
    if (cabecalho) linhas.push(`*${cabecalho}*`);
    if (variosGrupos && coord.length) linhas.push(...linhasCoord(coord, !!g), '');
    postos.forEach((s, i) => {
      const n = String(i + 1).padStart(2, '0');
      linhas.push(`Posto ${n} - *${tituloCaso(localDoPosto(s.titulo, g))}*`);
      linhas.push(juntarNomes(s.policiais.map(nomeEfetivo)));
      linhas.push('');
    });
    if (!postos.length) linhas.push('');
  }
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
