import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../ui.jsx';
import { money, fmtQty, parseNum } from '../lib/money.js';
import { addItem, changeQty, cartTotal, parseScan, findProduct, toVenda } from '../lib/cart.js';
import { textoFiado, linkWhatsApp } from '../lib/recibo.js';
import { fila, novaId } from '../store.js';

const PAY = [['dinheiro', 'Dinheiro'], ['pix', 'Pix'], ['cartao', 'Cartão'], ['fiado', 'Fiado']];

export default function Caixa({ lojaId, nomeLoja, can, dados, setDados, sync, setPendentes }) {
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [cart, setCart] = useState([]);
  const [pag, setPag] = useState('dinheiro');
  const [cliente, setCliente] = useState('');
  const [pago, setPago] = useState('');
  const [recibo, setRecibo] = useState(null);
  const scanRef = useRef(null);
  useEffect(() => scanRef.current?.focus(), []);

  const produtos = dados.produtos;
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => !q || p.nome.toLowerCase().includes(q) || (p.codigo_barras || '').includes(q)).slice(0, 30);
  }, [busca, produtos]);
  const total = cartTotal(cart);
  const troco = pag === 'dinheiro' && parseNum(pago) > 0 ? parseNum(pago) - total : null;
  const pagamentos = PAY.filter(([k]) => k !== 'fiado' || can('fiado'));

  function onScan(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const { qtd, termo } = parseScan(busca);
    if (!termo) return;
    const p = findProduct(produtos, termo);
    if (!p) return toast('Produto não encontrado. Cadastre o código em Produtos.');
    setCart((c) => addItem(c, p, qtd));
    setBusca('');
  }

  async function finalizar() {
    if (!cart.length) return;
    if (pag === 'fiado' && !cliente) return toast('Escolha o cliente do fiado.');
    if (troco !== null && troco < 0) return toast('Valor recebido menor que o total.');
    const venda = toVenda(cart, { id: novaId(), lojaId, pagamento: pag, clienteId: cliente });
    await fila.enqueue({ id: venda.id, tipo: 'venda', dados: venda });
    // atualização imediata na tela; o servidor confirma na sincronização
    setDados((d) => ({
      ...d,
      produtos: d.produtos.map((p) => {
        const l = cart.find((x) => x.produto_id === p.id);
        return l ? { ...p, estoque: Number(p.estoque) - l.qtd } : p;
      }),
      clientes: d.clientes.map((c) => (c.id === cliente && pag === 'fiado' ? { ...c, saldo_fiado: Number(c.saldo_fiado) + total } : c)),
      vendas: [{ ...venda, total, itens_venda: venda.itens, pendente: true, cancelada: false }, ...d.vendas],
    }));
    if (pag === 'fiado') {
      const c = dados.clientes.find((x) => x.id === cliente);
      setRecibo({ cliente: c, itens: cart, total, saldo: Number(c?.saldo_fiado || 0) + total });
    }
    setCart([]); setPago(''); setCliente('');
    toast(`Venda registrada: ${money(total)}`);
    setPendentes((n) => n + 1);
    sync();
    scanRef.current?.focus();
  }

  return (
    <div className="cols">
      <div className="panel stack">
        <label htmlFor="scan">Buscar produto
          <input id="scan" ref={scanRef} className="scan" autoComplete="off" placeholder="Passe o leitor ou digite o nome"
            value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={onScan} />
        </label>
        <div className="tiles">
          {lista.map((p) => {
            const baixo = Number(p.estoque_minimo) > 0 && Number(p.estoque) <= Number(p.estoque_minimo);
            return (
              <button key={p.id} type="button" className={'tile' + (baixo ? ' low' : '')}
                onClick={() => { setCart((c) => addItem(c, p)); setBusca(''); scanRef.current?.focus(); }}>
                <b>{p.nome}</b>
                <span><span className="price num">{money(p.preco)}</span><br /><span className="stock num">{fmtQty(p.estoque)} em estoque</span></span>
              </button>
            );
          })}
        </div>
        {!lista.length && <p className="empty">{produtos.length ? 'Nenhum produto com esse nome ou código.' : 'Nenhum produto cadastrado. Cadastre em Produtos.'}</p>}
      </div>

      <div className="panel stack receipt">
        <h2>Venda</h2>
        <div className="tw"><table><tbody>
          {cart.length ? cart.map((l, i) => (
            <tr key={l.produto_id}>
              <td>{l.nome}<div className="muted num">{money(l.preco)}</div></td>
              <td><span className="qty">
                <button type="button" aria-label={`Diminuir ${l.nome}`} onClick={() => setCart((c) => changeQty(c, i, -1))}>−</button>
                <span className="num">{fmtQty(l.qtd)}</span>
                <button type="button" aria-label={`Aumentar ${l.nome}`} onClick={() => setCart((c) => changeQty(c, i, 1))}>+</button>
              </span></td>
              <td className="r num">{money(l.preco * l.qtd)}</td>
            </tr>
          )) : <tr><td className="empty">Toque num produto ou passe o leitor.</td></tr>}
        </tbody></table></div>
        <div className="total"><span>Total</span><span className="num">{money(total)}</span></div>
        <div className="row">
          <label htmlFor="pag">Pagamento
            <select id="pag" value={pag} onChange={(e) => setPag(e.target.value)}>
              {pagamentos.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {pag === 'fiado' && (
            <label htmlFor="cli">Cliente
              <select id="cli" value={cliente} onChange={(e) => setCliente(e.target.value)}>
                <option value="">Escolha…</option>
                {dados.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome} ({money(c.saldo_fiado)})</option>)}
              </select>
            </label>
          )}
          {pag === 'dinheiro' && (
            <label htmlFor="pago">Cliente pagou<input id="pago" inputMode="decimal" placeholder="0,00" value={pago} onChange={(e) => setPago(e.target.value)} /></label>
          )}
        </div>
        {troco !== null && <p className="muted num">{troco >= 0 ? `Troco: ${money(troco)}` : `Faltam ${money(-troco)}`}</p>}
        <div className="row">
          <button className="btn primary" id="finish" type="button" onClick={finalizar} disabled={!cart.length}>Finalizar venda</button>
          <button className="btn" type="button" onClick={() => { setCart([]); setPago(''); }}>Limpar venda</button>
        </div>
        {recibo && (
          <div className="banner stack">
            <span>Venda no fiado para <b>{recibo.cliente?.nome}</b>. Saldo agora: <b>{money(recibo.saldo)}</b>.</span>
            <div className="row">
              <a className="btn primary" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
                href={linkWhatsApp(recibo.cliente?.telefone, textoFiado({ loja: nomeLoja, cliente: recibo.cliente?.nome, itens: recibo.itens, total: recibo.total, saldo: recibo.saldo }))}>
                Enviar comprovante no WhatsApp
              </a>
              <button className="btn" type="button" onClick={() => setRecibo(null)}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
