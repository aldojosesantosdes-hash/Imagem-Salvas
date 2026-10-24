// Gera o PDF da conferência no padrão do modelo: formulário preenchível,
// um checkbox "Presente" e um campo "Observação" por policial (nomes de campo pela matrícula).
import { slug } from './parser.js';

const A4 = [595.28, 841.89];
const M = 32; // margem lateral
const COL = { nome: M + 5, mat: 304, func: 362, pres: 440, obs: 484, fim: A4[0] - M };
const LINHA = 20;

export async function gerarPdf(dados) {
  const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
  const AZUL = rgb(0.13, 0.23, 0.42);
  const CINZA_CAB = rgb(0.86, 0.89, 0.93);
  const ZEBRA = rgb(0.95, 0.96, 0.975);
  const TEXTO = rgb(0.1, 0.1, 0.12);
  const SUAVE = rgb(0.35, 0.38, 0.42);
  const VERMELHO = rgb(0.6, 0.1, 0.12);

  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const neg = await doc.embedFont(StandardFonts.HelveticaBold);
  const brasao = dados.brasao ? await doc.embedPng(dados.brasao) : null;
  const form = doc.getForm();

  // Helvetica padrão só cobre WinAnsi: troca o que não for codificável.
  const seguro = (s) => Array.from(String(s ?? '')).map((c) => {
    try { reg.encodeText(c); return c; } catch { return '?'; }
  }).join('');
  const caber = (s, fonte, tam, larg) => {
    let t = seguro(s);
    while (t.length > 1 && fonte.widthOfTextAtSize(t, tam) > larg) t = t.slice(0, -2) + '…';
    return t;
  };
  const txt = (pg, s, x, y, { f = reg, size = 7, color = TEXTO, larg } = {}) => {
    const t = larg ? caber(s, f, size, larg) : seguro(s);
    pg.drawText(t, { x, y, size, font: f, color });
  };
  const centro = (pg, s, y, opts) => {
    const t = seguro(s);
    const w = (opts.f || reg).widthOfTextAtSize(t, opts.size);
    txt(pg, t, (A4[0] - w) / 2, y, opts);
  };

  const nomeDoc = `Conferencia-${slug(dados.subtitulo || dados.titulo)}`;
  const prefixoCampo = slug(dados.subtitulo || dados.titulo) || 'Conferencia';
  const paginas = [];
  let pg;
  let y;

  const novaPagina = (primeira) => {
    pg = doc.addPage(A4);
    paginas.push(pg);
    y = A4[1] - 36;
    if (brasao) {
      const h = primeira ? 40 : 28;
      pg.drawImage(brasao, { x: M + 4, y: y - h + 6, width: h * brasao.width / brasao.height, height: h });
    }
    const xT = M + (primeira ? 52 : 40);
    txt(pg, 'POLÍCIA MILITAR DA BAHIA', xT, y - 8, { f: neg, size: primeira ? 10 : 8.5, color: AZUL });
    txt(pg, [dados.comando, dados.unidade].filter(Boolean).join(' | '), xT, y - (primeira ? 22 : 18), { f: neg, size: 6.5, color: AZUL });
    if (!primeira) {
      txt(pg, 'CONFERÊNCIA DIGITAL DE PRESENÇA (continuação)', A4[0] - M - 190, y - 8, { f: neg, size: 7, color: AZUL });
      y -= 40;
      return;
    }
    y -= 62;
    centro(pg, dados.titulo, y, { f: neg, size: 14, color: AZUL });
    if (dados.subtitulo) { y -= 17; centro(pg, dados.subtitulo, y, { f: neg, size: 8, color: AZUL }); }
    y -= 14;
    pg.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: rgb(0.7, 0.72, 0.76) });
    y -= 17;
    centro(pg, 'CONFERÊNCIA DIGITAL DE PRESENÇA', y, { f: neg, size: 9, color: AZUL });
    y -= 22;
    const efetivoTxt = dados.subtitulo ? 'EFETIVO DO POSTO' : 'EFETIVO';
    txt(pg, `DATA: ${dados.data} | SERVIÇO: ${dados.servico} | ${efetivoTxt}: ${dados.total} policiais.`, M + 4, y, { f: neg, size: 8, larg: A4[0] - 2 * M - 8 });
    y -= 14;
    txt(pg, `RESPONSÁVEL: ${dados.responsavel || '—'}`, M + 4, y, { size: 7.5, larg: A4[0] - 2 * M - 8 });
    y -= 13;
    txt(pg, 'Conferência do comandante e das equipes vinculadas ao posto.', M + 4, y, { size: 6.5, color: SUAVE });
    y -= 11;
    txt(pg, 'Marque a presença e registre faltas, atrasos ou substituições. Salve o PDF após preencher.', M + 4, y, { size: 6.5, color: SUAVE });
    y -= 20;
  };

  const garantir = (altura) => {
    if (y - altura < 70) novaPagina(false);
  };

  const cabecalhoTabela = (s, cont) => {
    pg.drawRectangle({ x: M, y: y - 22, width: A4[0] - 2 * M, height: 22, color: AZUL });
    txt(pg, s.titulo + (cont ? ' (cont.)' : ''), M + 7, y - 14, { f: neg, size: 7, color: rgb(1, 1, 1), larg: A4[0] - 2 * M - 14 });
    y -= 34;
    txt(pg, `${s.data}, DE ${s.horaInicio} ÀS ${s.horaFim}`, M + 5, y, { f: neg, size: 6.2, color: AZUL });
    y -= 6;
    pg.drawRectangle({ x: M, y: y - 14, width: A4[0] - 2 * M, height: 14, color: CINZA_CAB });
    const yc = y - 9.5;
    txt(pg, 'Nome', COL.nome, yc, { f: neg, size: 6.2 });
    txt(pg, 'Matrícula', COL.mat, yc, { f: neg, size: 6.2 });
    txt(pg, 'Função', COL.func, yc, { f: neg, size: 6.2 });
    txt(pg, 'Presente', COL.pres - 2, yc, { f: neg, size: 6.2 });
    txt(pg, 'Observação', COL.obs + 2, yc, { f: neg, size: 6.2 });
    y -= 14;
  };

  novaPagina(true);
  // Marca d'água discreta, como no modelo (aplicada ao final em todas as páginas).
  const marca = `${nomeDoc}${dados.emitente ? ' · ' + dados.emitente : ''}`;

  for (const s of dados.secoes) {
    garantir(22 + 34 + 14 + LINHA * Math.min(2, s.policiais.length));
    cabecalhoTabela(s, false);
    s.policiais.forEach((p, i) => {
      if (y - LINHA < 70) { novaPagina(false); cabecalhoTabela(s, true); }
      const base = y - LINHA;
      if (i % 2 === 1) pg.drawRectangle({ x: M, y: base, width: A4[0] - 2 * M, height: LINHA, color: ZEBRA });
      const ty = base + 7;
      const cmd = /comandante/i.test(p.funcao);
      txt(pg, p.nome, COL.nome, ty, { f: cmd ? neg : reg, size: 6.4, larg: COL.mat - COL.nome - 6 });
      txt(pg, p.matricula, COL.mat, ty, { size: 6.4 });
      txt(pg, p.funcao, COL.func, ty, { size: 6.4, larg: COL.pres - COL.func - 6 });

      const cb = form.createCheckBox(`${prefixoCampo}_presenca_${p.campo}`);
      cb.addToPage(pg, { x: COL.pres + 7, y: base + 3.5, width: 13, height: 13, borderColor: rgb(0.2, 0.2, 0.25), borderWidth: 0.8, backgroundColor: rgb(1, 1, 1) });
      if (p.status === 'P') cb.check();

      const tf = form.createTextField(`${prefixoCampo}_presenca_${p.campo}_obs`);
      const obs = p.status === 'F' && !p.obs ? 'FALTA' : (p.status === 'F' && !/^FALTA/i.test(p.obs) ? `FALTA - ${p.obs}` : p.obs || '');
      if (obs) tf.setText(seguro(obs));
      tf.addToPage(pg, { x: COL.obs, y: base + 2.5, width: COL.fim - COL.obs - 3, height: 15, borderColor: rgb(0.2, 0.2, 0.25), borderWidth: 0.8, backgroundColor: rgb(1, 1, 1), font: reg });
      tf.setFontSize(6.5);
      y = base;
    });
    y -= 10;
  }

  // Resumo e assinatura.
  garantir(120);
  y -= 4;
  pg.drawRectangle({ x: M, y: y - 52, width: A4[0] - 2 * M, height: 52, borderColor: rgb(0.75, 0.78, 0.82), borderWidth: 0.6 });
  txt(pg, 'RESUMO DA CONFERÊNCIA', M + 8, y - 13, { f: neg, size: 7.5, color: AZUL });
  const r = dados.resumo;
  const itens = [['Efetivo previsto', r.total], ['Presentes', r.presentes], ['Faltas', r.faltas], ['Não conferidos', r.pendentes]];
  itens.forEach(([rot, val], k) => {
    const x = M + 8 + k * ((A4[0] - 2 * M - 16) / 4);
    txt(pg, String(val), x, y - 35, { f: neg, size: 13, color: k === 2 && val > 0 ? VERMELHO : TEXTO });
    txt(pg, rot, x, y - 45, { size: 6.2, color: SUAVE });
  });
  y -= 52;
  if (dados.conferidoEm) {
    y -= 11;
    txt(pg, `Conferência registrada em ${dados.conferidoEm}${dados.emitente ? ' por ' + dados.emitente : ''}.`, M + 4, y, { size: 6.2, color: SUAVE });
  }
  y -= 44;
  const xa = A4[0] / 2 - 110;
  pg.drawLine({ start: { x: xa, y }, end: { x: xa + 220, y }, thickness: 0.6, color: TEXTO });
  centro(pg, dados.responsavel || 'Responsável pela conferência', y - 10, { f: neg, size: 7 });
  centro(pg, 'Responsável pela conferência', y - 19, { size: 6.2, color: SUAVE });

  const emitido = new Date().toLocaleString('pt-BR');
  paginas.forEach((p, i) => {
    for (let k = 0; k < 4; k++) {
      p.drawText(seguro(marca), { x: -40 + k * 40, y: 120 + k * 200, size: 15, font: reg, color: rgb(0.85, 0.87, 0.9), opacity: 0.35, rotate: degrees(28) });
    }
    p.drawLine({ start: { x: M, y: 48 }, end: { x: A4[0] - M, y: 48 }, thickness: 0.5, color: rgb(0.75, 0.78, 0.82) });
    txt(p, `${dados.unidade || ''} | ${dados.titulo}`, M + 4, 38, { size: 6, color: SUAVE, larg: 420 });
    const pag = `Página ${i + 1} de ${paginas.length}`;
    txt(p, pag, A4[0] - M - reg.widthOfTextAtSize(pag, 6) - 4, 38, { size: 6, color: SUAVE });
    txt(p, `CÓPIA CONTROLADA${dados.emitente ? ' · ' + dados.emitente : ''} · gerado em ${emitido} · ${nomeDoc}`, M + 4, 20, { size: 5.5, color: VERMELHO, larg: A4[0] - 2 * M });
  });

  doc.setTitle(seguro(`CONFERÊNCIA DIGITAL DE PRESENÇA | ${dados.titulo}`));
  doc.setSubject(seguro(dados.subtitulo || ''));
  form.updateFieldAppearances(reg);
  const bytes = await doc.save();
  return { bytes, nome: `${nomeDoc}.pdf` };
}

// Lê marcações de um PDF de conferência já preenchido (campos *_presenca_<matrícula>[_obs]).
export async function lerMarcacoes(bytes) {
  const { PDFDocument, PDFCheckBox, PDFTextField } = window.PDFLib;
  const out = {};
  let doc;
  try { doc = await PDFDocument.load(bytes, { ignoreEncryption: true }); } catch { return out; }
  for (const f of doc.getForm().getFields()) {
    const m = f.getName().match(/_presenca_(\d+(?:_\d+)?)(_obs)?$/);
    if (!m) continue;
    const reg = (out[m[1]] ||= {});
    if (m[2] && f instanceof PDFTextField) reg.obs = f.getText() || '';
    else if (!m[2] && f instanceof PDFCheckBox) reg.marcado = f.isChecked();
  }
  return out;
}
