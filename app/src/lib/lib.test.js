import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, money, dayKey } from './money.js';
import { addItem, changeQty, cartTotal, parseScan, findProduct, toVenda } from './cart.js';
import { createFila, memoryStorage, ERRO_REDE } from './fila.js';
import { waPhone, textoFiado, linkWhatsApp } from './recibo.js';

const arroz = { id: 'a', nome: 'Arroz 5 kg', preco: 27.9, codigo_barras: '789' };
const feijao = { id: 'f', nome: 'Feijão', preco: 8.49, codigo_barras: '790' };

test('parseNum entende formatos brasileiros', () => {
  assert.equal(parseNum('1.234,56'), 1234.56);
  assert.equal(parseNum('27,90'), 27.9);
  assert.equal(parseNum('27.90'), 27.9);
  assert.equal(parseNum('R$ 10'), 10);
  assert.equal(parseNum('abc'), 0);
});

test('money formata em reais', () => {
  assert.match(money(1234.5), /1\.234,50/);
});

test('dayKey usa o fuso do aparelho', () => {
  assert.match(dayKey(new Date(2026, 9, 14, 23, 30)), /^2026-10-14$/);
});

test('carrinho soma, agrupa e remove ao zerar', () => {
  let c = addItem([], arroz);
  c = addItem(c, arroz);
  c = addItem(c, feijao, 2);
  assert.equal(c.length, 2);
  assert.equal(cartTotal(c), 72.78);
  c = changeQty(c, 1, -2);
  assert.deepEqual(c.map((l) => l.produto_id), ['a']);
});

test('total arredonda por linha em centavos', () => {
  assert.equal(cartTotal([{ preco: 0.1, qtd: 3 }, { preco: 0.2, qtd: 1 }]), 0.5);
});

test('parseScan e findProduct', () => {
  assert.deepEqual(parseScan('3*789'), { qtd: 3, termo: '789' });
  assert.deepEqual(parseScan('789'), { qtd: 1, termo: '789' });
  assert.equal(findProduct([arroz, feijao], '790'), feijao);
  assert.equal(findProduct([arroz, feijao], 'arr'), arroz);
  assert.equal(findProduct([arroz, { ...feijao, nome: 'Arroz integral' }], 'arroz'), null);
});

test('toVenda só leva cliente no fiado', () => {
  const c = addItem([], arroz);
  assert.equal(toVenda(c, { id: '1', lojaId: 'L', pagamento: 'pix', clienteId: 'x' }).cliente_id, null);
  assert.equal(toVenda(c, { id: '1', lojaId: 'L', pagamento: 'fiado', clienteId: 'x' }).cliente_id, 'x');
});

test('fila: sem internet guarda e reenvia na ordem', async () => {
  const fila = createFila(memoryStorage());
  for (let i = 1; i <= 20; i++) await fila.enqueue({ id: String(i), tipo: 'venda' });
  await fila.enqueue({ id: '1', tipo: 'venda' }); // duplicada não entra
  let online = false;
  const recebidas = [];
  const send = async (op) => {
    if (!online) throw { tipo: ERRO_REDE };
    recebidas.push(op.id);
  };
  let r = await fila.flush(send);
  assert.equal(r.enviadas, 0);
  assert.equal(r.pendentes, 20);
  online = true;
  r = await fila.flush(send);
  assert.equal(r.enviadas, 20);
  assert.equal(r.pendentes, 0);
  assert.deepEqual(recebidas, Array.from({ length: 20 }, (_, i) => String(i + 1)));
});

test('fila: recusa do servidor vai para falhas e não trava as demais', async () => {
  const fila = createFila(memoryStorage());
  await fila.enqueue({ id: 'x' });
  await fila.enqueue({ id: 'y' });
  const r = await fila.flush(async (op) => {
    if (op.id === 'x') throw new Error('produto inválido');
  });
  assert.equal(r.enviadas, 1);
  assert.equal((await fila.falhas()).length, 1);
});

test('WhatsApp: telefone e texto', () => {
  assert.equal(waPhone('(71) 98888-7777'), '5571988887777');
  assert.equal(waPhone('5571988887777'), '5571988887777');
  assert.equal(waPhone('123'), null);
  const t = textoFiado({ loja: 'Mercadinho Nascimento', cliente: 'Maria', itens: [{ nome: 'Café', qtd: 1, preco: 18.9 }], total: 18.9, saldo: 45.8 });
  assert.match(t, /Saldo em aberto: \*R\$\s45,80\*/);
  assert.match(linkWhatsApp('71988887777', 'oi'), /^https:\/\/wa\.me\/5571988887777\?text=oi$/);
});
