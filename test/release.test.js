import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarRelease, tituloCaso, substituto, formatarPosto, separarPosto } from '../conferencia/release.js';

const sec = (titulo, policiais, horaInicio = '12h00', horaFim = '18h00') => ({ titulo, data: '04/10/2026', horaInicio, horaFim, policiais });
const GUERRA = { 10000001: 'ALFA', 10000002: 'BRAVO', 10000003: 'CHARLIE', 10000004: 'DELTA', 10000005: 'ECHO' };
const guerra = (p) => GUERRA[p.matricula] || null;

test('extrato no padrão do modelo', () => {
  const { texto, faltando } = gerarRelease({
    comando: 'CPRC - BTS', unidade: '18º BPM - CENTRO HISTÓRICO', titulo: 'ELEIÇÃO 2026',
    secoes: [
      sec('SETOR 1 - TARDE - COORDENAÇÃO', [
        { nome: 'TEN PM FULANO ALFA DE TAL', matricula: '10000001', funcao: 'Comandante', status: 'P' },
        { nome: 'SD PM BELTRANO BRAVO', matricula: '10000002', funcao: 'Motorista', status: 'P' },
      ]),
      sec('SETOR 1 - TARDE - BAHIA BRITS CLUB (CLUBE INGLÊS)', [
        { nome: 'SD PM CICRANO CHARLIE', matricula: '10000003', funcao: 'Comandante', status: 'P', obs: 'Atraso 10 min' },
        { nome: 'SD PM JOSE DELTA', matricula: '10000004', funcao: 'Patrulheiro', status: 'P' },
      ]),
      sec('SETOR 1 - TARDE - COLÉGIO MANOEL NOVAES', [
        { nome: 'SD PM JOAO ECHO', matricula: '10000005', funcao: 'Comandante', status: 'P' },
        { nome: 'SD PM SEM CADASTRO', matricula: '11111111', funcao: 'Patrulheiro', status: 'F' },
      ]),
    ],
  }, { guerra, vtr: '8.2815' });
  assert.equal(texto, [
    '*POLÍCIA MILITAR DA BAHIA*',
    '*COPPM / CPRC-BTS*',
    '*18° BPM*',
    '', '',
    '*Operação Eleição*',
    '', '',
    '*Extrato da Operação Eleição/2026*',
    '',
    '*Data*: 04/10/2026  (domingo)',
    '*Horário:* 12h às 18h',
    '',
    'Coordenador: Ten PM *Alfa*',
    'Motorista: SD PM *Bravo*',
    'Vtr: 8.2815',
    '',
    '*1 - Bahia Brits Club (Clube Inglês)*',
    'SD PM *Charlie*',
    'SD PM *Delta*',
    '', '',
    '*2 - Colégio Manoel Novaes*',
    'SD PM *Echo*',
    'SD PM *Sem Cadastro* (falta)',
    '', '',
    '*RESUMO:*',
    'Efetivo previsto: 06',
    'Efetivo ativo: 05',
    'Faltas: 01',
    'Atrasos: 01',
    '', '',
    '*PMBA, uma Força a serviço do cidadão!*',
    '',
  ].join('\n'));
  assert.deepEqual(faltando, [{ matricula: '11111111', nome: 'SD PM SEM CADASTRO' }]);
});

test('substituto entra no lugar e conta como efetivo ativo', () => {
  const { texto } = gerarRelease({
    titulo: 'Operação Eleições 2026',
    secoes: [sec('COLÉGIO SACRAMENTINAS', [{ nome: 'SD PM A B', matricula: '1', funcao: 'Patrulheiro', status: 'F', obs: 'Substituído por SD PM Foxtrot' }])],
  });
  assert.match(texto, /\*Operação Eleições\*/);
  assert.match(texto, /\*1 - Colégio Sacramentinas\*\nSD PM \*Foxtrot\*\n/);
  assert.match(texto, /Efetivo ativo: 01\nFaltas: 01/);
});

test('manhã e tarde viram blocos com cabeçalho próprio', () => {
  const { texto } = gerarRelease({
    titulo: 'ELEIÇÃO 2026',
    secoes: [
      sec('SETOR 1 - PO A PÉ - COLÉGIO MANOEL NOVAES', [{ nome: 'SD PM A', funcao: 'Patrulheiro' }], '07h00', '13h00'),
      sec('SETOR 1 - TARDE - COLÉGIO MANOEL NOVAES', [{ nome: 'SD PM B', funcao: 'Patrulheiro' }]),
    ],
  });
  assert.match(texto, /\*Setor 1 – 07h às 13h\*\n\*1 - Colégio Manoel Novaes\*/);
  assert.match(texto, /\*Setor 1 – 12h às 18h\*\n\*1 - Colégio Manoel Novaes\*/);
  assert.match(texto, /Não conferidos: 02/);
});

test('auxiliares de formatação', () => {
  assert.equal(tituloCaso('ESCOLA DE BELAS ARTES - UFBA'), 'Escola de Belas Artes - UFBA');
  assert.equal(formatarPosto('1º TEN PM'), '1° Ten PM');
  assert.equal(formatarPosto('SUB TEN PM'), 'SUB TEN PM');
  assert.deepEqual(separarPosto('TEN CEL PM FULANA DE TAL'), { posto: 'TEN CEL PM', resto: 'FULANA DE TAL' });
  assert.equal(substituto({ obs: 'substituída por sd pm y' }), 'SD PM Y');
});
