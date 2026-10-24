import test from 'node:test';
import assert from 'node:assert/strict';
import { linhasDeItens, interpretarEscala, sufixoComum, efetivo, resumo, slug } from '../conferencia/parser.js';

// Monta itens de texto como o pdf.js entrega (y decrescente = descendo na página).
function pagina(linhas) {
  const itens = [];
  linhas.forEach((cols, i) => {
    const y = 800 - i * 14;
    for (const [x, str] of cols) itens.push({ str, x, y, w: str.length * 4 });
  });
  return linhasDeItens(itens);
}

const ESCALA = pagina([
  [[200, 'POLÍCIA MILITAR DA BAHIA']],
  [[250, 'CPRC - BTS']],
  [[220, '18º BPM - CENTRO HISTÓRICO']],
  [[180, 'ENSAIO PRIMAVERA / VERÃO DO OLODUM 2026']],
  [[40, 'PRESCRIÇÕES:']],
  [[40, 'COMANDANTE PORTAL DE ABORDAGEM - ALFREDO DE BRITO / BECO DO MOTA - DATA: 11/10/2026, DE 13h00 ÀS 21h00']],
  [[40, 'Nome'], [330, 'Matrícula'], [400, 'Função']],
  [[40, 'SUB TEN PM RUI ANDRADE CAMPOS'], [330, '30283554'], [400, 'Comandante']],
  [[40, 'PORTAL DE ABORDAGEM - 18º Batalhão - RUA ALFREDO DE BRITO / BECO DO MOTA - DATA: 11/10/2026, DE 13h00']],
  [[40, 'ÀS 21h00']],
  [[40, 'Nome'], [330, 'Matrícula'], [400, 'Função']],
  [[40, 'SD PM '], [64, 'SAMUEL'], [92, ' SILVA SENA'], [330, '92037319'], [400, 'Coordenador']],
  [[400, 'Operacional']],
  [[40, '1º SGT PM JOSE ALVES'], [330, '30283554'], [400, 'Patrulheiro']],
]);

test('lê cabeçalho, seções e policiais da escala SISGESPOL', () => {
  const e = interpretarEscala(ESCALA);
  assert.equal(e.comando, 'CPRC - BTS');
  assert.equal(e.unidade, '18º BPM - CENTRO HISTÓRICO');
  assert.equal(e.titulo, 'ENSAIO PRIMAVERA / VERÃO DO OLODUM 2026');
  assert.equal(e.secoes.length, 2);
  assert.deepEqual(e.secoes[0].policiais, [{ nome: 'SUB TEN PM RUI ANDRADE CAMPOS', matricula: '30283554', funcao: 'Comandante' }]);
  const s = e.secoes[1];
  assert.equal(s.titulo, 'PORTAL DE ABORDAGEM - 18º Batalhão - RUA ALFREDO DE BRITO / BECO DO MOTA');
  assert.equal(s.horaFim, '21h00');
  assert.equal(s.policiais[0].nome, 'SD PM SAMUEL SILVA SENA');
  assert.equal(s.policiais[0].funcao, 'Coordenador Operacional');
  assert.equal(s.policiais[1].nome, '1º SGT PM JOSE ALVES');
});

test('lê o formato da conferência (título na barra, data na linha de baixo)', () => {
  const e = interpretarEscala(pagina([
    [[60, 'POLÍCIA MILITAR DA BAHIA']],
    [[60, 'CPRC - BTS | 18º BPM - CENTRO HISTÓRICO']],
    [[150, 'ENSAIO PRIMAVERA / VERÃO DO OLODUM 2026']],
    [[200, 'PORTAL ALFREDO DE BRITO / BECO DO MOTA']],
    [[40, 'PATRULHAS EM REFORÇO - CPRC-BTS 3 - RUA ALFREDO DE BRITO / BECO DO MOTA']],
    [[40, '11/10/2026, DE 13h00 ÀS 21h00']],
    [[40, 'Nome'], [330, 'Matrícula'], [400, 'Função'], [480, 'Presente'], [530, 'Observação']],
    [[40, 'CB PM REMIDIO COSTA SOARES'], [330, '30494570'], [400, 'Patrulheiro']],
  ]));
  assert.equal(e.unidade, '18º BPM - CENTRO HISTÓRICO');
  assert.equal(e.subtitulo, 'PORTAL ALFREDO DE BRITO / BECO DO MOTA');
  assert.equal(e.secoes[0].titulo, 'PATRULHAS EM REFORÇO - CPRC-BTS 3 - RUA ALFREDO DE BRITO / BECO DO MOTA');
  assert.equal(e.secoes[0].policiais[0].matricula, '30494570');
});

test('matrícula repetida gera nome de campo único e o resumo conta status', () => {
  const e = interpretarEscala(ESCALA);
  const l = efetivo(e, [0, 1]);
  assert.deepEqual(l.map((p) => p.campo), ['30283554', '92037319', '30283554_2']);
  assert.deepEqual(resumo(l, { '0_0': { status: 'P' }, '1_0': { status: 'F' } }), { total: 3, presentes: 1, faltas: 1, pendentes: 1 });
});

test('sufixo comum e slug', () => {
  assert.equal(sufixoComum(['COMANDANTE - ALFREDO DE BRITO / BECO DO MOTA', 'PATRULHA - RUA ALFREDO DE BRITO / BECO DO MOTA']), 'ALFREDO DE BRITO / BECO DO MOTA');
  assert.equal(sufixoComum(['A X', 'B Y']), '');
  assert.equal(slug('PORTAL ALFREDO DE BRITO'), 'Portal-Alfredo-de-Brito');
});
