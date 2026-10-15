const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (v) => brl.format(Number(v) || 0);

// Aceita "1.234,56", "1234,56", "1234.56" e "12".
export function parseNum(s) {
  let t = String(s ?? '').trim().replace(/\s|R\$/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

export const fmtQty = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const fmtInput = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Dia no fuso do aparelho (YYYY-MM-DD).
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
