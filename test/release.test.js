import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarRelease, tituloCaso, nomeEfetivo } from '../conferencia/release.js';

const sec = (titulo, policiais, horaInicio = '07h00', horaFim = '13h00') => ({ titulo, data: '04/10/2026', horaInicio, horaFim, policiais });

test('release no padrão do modelo: coordenação, setor e postos numerados', () => {
  const txt = gerarRelease({
    comando: 'CPRC - BTS', unidade: '18º BPM - CENTRO HISTÓRICO', titulo: 'Operação Eleições 2026',
    secoes: [
      sec('SETOR 3 - COORDENAÇÃO DO POLICIAMENTO', [
        { nome: 'CAP PM ERIC SOUZA', funcao: 'Comandante' },
        { nome: 'TEN PM LUIS ALBERTO', funcao: 'Adjunto' },
      ]),
      sec('SETOR 3 - COLÉGIO ESTADUAL URSULA CATHARINO', [
        { nome: 'SGT PM JOEL TELES DO NASCIMENTO', funcao: 'Comandante' },
        { nome: 'SD PM JOÃO BAPTISTA MELLO', funcao: 'Patrulheiro' },
      ]),
      sec('SETOR 3 - PO A PÉ - FUNDAÇÃO VISCONDE DE CAYRU', [
        { nome: 'SGT PM MOACIR ALVES DOS SANTOS', funcao: 'Comandante' },
        { nome: 'SD PM LUIZ HENRIQUE', funcao: 'Patrulheiro', obs: 'Atraso; Substituído por SD PM FULANO' },
      ]),
    ],
  });
  assert.equal(txt, [
    '*CPRC-BTS   18ºBPM*',
    '',
    '*OPERAÇÃO ELEIÇÕES 2026*',
    '_04/10/2026 · 07h00 às 13h00_',
    '',
    'Comandante do Setor: CAP PM ERIC SOUZA',
    'Adjunto: TEN PM LUIS ALBERTO',
    '',
    '*Setor 3*',
    'Posto 01 - *Colégio Estadual Ursula Catharino*',
    'SGT PM JOEL TELES DO NASCIMENTO E SD PM JOÃO BAPTISTA MELLO',
    '',
    'Posto 02 - *Fundação Visconde de Cayru*',
    'SGT PM MOACIR ALVES DOS SANTOS E SD PM FULANO',
    '',
  ].join('\n'));
});

test('manhã e tarde viram blocos separados', () => {
  const txt = gerarRelease({
    titulo: 'ELEIÇÃO 2026',
    secoes: [
      sec('SETOR 1 - PO A PÉ - COLÉGIO MANOEL NOVAES', [{ nome: 'SD PM A', funcao: 'Patrulheiro' }]),
      sec('SETOR 1 - TARDE - COLÉGIO MANOEL NOVAES', [{ nome: 'SD PM B', funcao: 'Patrulheiro' }], '12h00', '18h00'),
    ],
  });
  assert.match(txt, /\*Setor 1 – 07h00 às 13h00\*\nPosto 01 - \*Colégio Manoel Novaes\*\nSD PM A/);
  assert.match(txt, /\*Setor 1 – 12h00 às 18h00\*\nPosto 01 - \*Colégio Manoel Novaes\*\nSD PM B/);
});

test('caixa de título e nome efetivo', () => {
  assert.equal(tituloCaso('BAHIA BRITS CLUB (CLUBE INGLÊS)'), 'Bahia Brits Club (Clube Inglês)');
  assert.equal(tituloCaso('ESCOLA DE BELAS ARTES - UFBA'), 'Escola de Belas Artes - UFBA');
  assert.equal(nomeEfetivo({ nome: 'SD PM X', obs: '' }), 'SD PM X');
  assert.equal(nomeEfetivo({ nome: 'SD PM X', obs: 'substituída por sd pm y' }), 'SD PM Y');
});
