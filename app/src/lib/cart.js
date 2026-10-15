import { round2 } from './money.js';

// Carrinho imutável: cada função devolve um novo array de linhas {produto_id, nome, preco, qtd}.
export function addItem(cart, produto, qtd = 1) {
  const i = cart.findIndex((l) => l.produto_id === produto.id);
  if (i >= 0) return cart.map((l, k) => (k === i ? { ...l, qtd: l.qtd + qtd } : l));
  return [...cart, { produto_id: produto.id, nome: produto.nome, preco: Number(produto.preco) || 0, qtd }];
}

export function changeQty(cart, index, delta) {
  return cart.map((l, k) => (k === index ? { ...l, qtd: l.qtd + delta } : l)).filter((l) => l.qtd > 0);
}

export const cartTotal = (cart) => round2(cart.reduce((s, l) => s + round2(l.preco * l.qtd), 0));

// "3*7890001" => 3 unidades do código 7890001
export function parseScan(text) {
  const t = String(text).trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*\*\s*(.+)$/);
  if (!m) return { qtd: 1, termo: t };
  return { qtd: parseFloat(m[1].replace(',', '.')), termo: m[2].trim() };
}

export function findProduct(produtos, termo) {
  const byCode = produtos.find((p) => p.codigo_barras && p.codigo_barras === termo);
  if (byCode) return byCode;
  const q = termo.toLowerCase();
  const hits = produtos.filter((p) => p.nome.toLowerCase().includes(q));
  return hits.length === 1 ? hits[0] : null;
}

export function toVenda(cart, { id, lojaId, pagamento, clienteId = null, data = new Date() }) {
  return {
    id,
    loja_id: lojaId,
    data: new Date(data).toISOString(),
    pagamento,
    cliente_id: pagamento === 'fiado' ? clienteId : null,
    itens: cart.map((l) => ({ produto_id: l.produto_id, nome: l.nome, qtd: l.qtd, preco: l.preco })),
  };
}
