import { money, fmtQty } from './money.js';

// Celular brasileiro para o formato do WhatsApp (55 + DDD + número). Devolve null se inválido.
export function waPhone(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

export function textoFiado({ loja, cliente, itens = [], total, saldo, data = new Date(), tipo = 'compra' }) {
  const dia = new Date(data).toLocaleDateString('pt-BR');
  const linhas = [`*${loja}*`, `Olá, ${cliente}!`];
  if (tipo === 'compra') {
    linhas.push(`Compra no fiado em ${dia}:`);
    itens.forEach((i) => linhas.push(`• ${fmtQty(i.qtd)}x ${i.nome}: ${money(i.qtd * i.preco)}`));
    linhas.push(`Total da compra: ${money(total)}`);
  } else {
    linhas.push(`Recebemos ${money(total)} em ${dia}. Obrigado!`);
  }
  linhas.push(`Saldo em aberto: *${money(saldo)}*`);
  return linhas.join('\n');
}

export function linkWhatsApp(tel, texto) {
  const n = waPhone(tel);
  const q = encodeURIComponent(texto);
  return n ? `https://wa.me/${n}?text=${q}` : `https://wa.me/?text=${q}`;
}
