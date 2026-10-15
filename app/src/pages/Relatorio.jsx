import React, { useEffect, useMemo, useState } from 'react';
import { useToast, ConfirmButton } from '../ui.jsx';
import { money, fmtQty, dayKey } from '../lib/money.js';
import { api, fila } from '../store.js';

const PAY = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', fiado: 'Fiado' };

function baixarCsv(nome, linhas) {
  const csv = linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Relatorio({ user, can, dados, recarregar }) {
  const toast = useToast();
  const [periodo, setPeriodo] = useState('dia');
  const [dia, setDia] = useState(dayKey());
  const [falhas, setFalhas] = useState([]);
  useEffect(() => { fila.falhas().then(setFalhas); }, [dados]);
  const verTudo = can('relatorio');

  const vendas = useMemo(() => dados.vendas.filter((v) => {
    const k = dayKey(v.data);
    const noPeriodo = periodo === 'dia' ? k === dia : k.slice(0, 7) === dia.slice(0, 7);
    return noPeriodo && (verTudo || v.vendedor_id === user.id);
  }), [dados.vendas, periodo, dia, verTudo, user.id]);
  const validas = vendas.filter((v) => !v.cancelada);
  const total = validas.reduce((s, v) => s + Number(v.total), 0);
  const custo = validas.reduce((s, v) => s + (v.itens_venda || []).reduce((a, i) => a + Number(i.custo || 0) * Number(i.qtd), 0), 0);
  const porPag = {};
  validas.forEach((v) => (porPag[v.pagamento] = (porPag[v.pagamento] || 0) + Number(v.total)));
  const top = Object.entries(validas.reduce((m, v) => {
    (v.itens_venda || []).forEach((i) => { const a = (m[i.nome] ||= { q: 0, t: 0 }); a.q += Number(i.qtd); a.t += Number(i.qtd) * Number(i.preco); });
    return m;
  }, {})).sort((a, b) => b[1].t - a[1].t).slice(0, 8);
  const baixo = dados.produtos.filter((p) => Number(p.estoque_minimo) > 0 && Number(p.estoque) <= Number(p.estoque_minimo));
  const aberto = dados.clientes.reduce((s, c) => s + Number(c.saldo_fiado), 0);
  const nomeCliente = (id) => dados.clientes.find((c) => c.id === id)?.nome || '';

  return (
    <div className="stack">
      <div className="row">
        <label htmlFor="per" style={{ flex: '0 1 160px' }}>Período
          <select id="per" value={periodo} onChange={(e) => setPeriodo(e.target.value)}><option value="dia">Dia</option><option value="mes">Mês</option></select>
        </label>
        <label htmlFor="dia" style={{ flex: '0 1 200px' }}>{periodo === 'dia' ? 'Dia' : 'Mês de'}<input id="dia" type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} /></label>
        {verTudo && <button className="btn" type="button" onClick={() => baixarCsv(`vendas-${periodo === 'dia' ? dia : dia.slice(0, 7)}.csv`, [
          ['Data', 'Hora', 'Itens', 'Pagamento', 'Cliente', 'Total', 'Cancelada'],
          ...vendas.map((v) => [new Date(v.data).toLocaleDateString('pt-BR'), new Date(v.data).toLocaleTimeString('pt-BR'),
            (v.itens_venda || []).map((i) => `${fmtQty(i.qtd)}x ${i.nome}`).join(', '), PAY[v.pagamento], nomeCliente(v.cliente_id),
            Number(v.total).toFixed(2).replace('.', ','), v.cancelada ? 'sim' : '']),
        ])}>Exportar planilha</button>}
      </div>

      <div className="kpis">
        <div className="kpi"><span>Vendido ({validas.length} {validas.length === 1 ? 'venda' : 'vendas'})</span><b className="num">{money(total)}</b></div>
        {can('custo') && <div className="kpi"><span>Lucro bruto</span><b className="num">{money(total - custo)}</b></div>}
        {can('fiado') && verTudo && <div className="kpi"><span>Fiado a receber</span><b className="num">{money(aberto)}</b></div>}
        {Object.keys(porPag).length > 0 && <p className="muted num" style={{ gridColumn: '1/-1', margin: 0 }}>
          {Object.keys(PAY).filter((k) => porPag[k]).map((k) => `${PAY[k]} ${money(porPag[k])}`).join(' · ')}</p>}
      </div>

      {falhas.length > 0 && (
        <div className="banner">
          {falhas.length} operação(ões) feita(s) sem internet foram recusadas pelo servidor (por exemplo, produto removido). Último motivo: {falhas[falhas.length - 1].erro}
        </div>
      )}

      {verTudo && (
        <div className="cols">
          <div className="panel"><h3>Mais vendidos</h3><div className="tw"><table><tbody>
            {top.map(([n, a]) => <tr key={n}><td>{n}</td><td className="r num">{fmtQty(a.q)}</td><td className="r num">{money(a.t)}</td></tr>)}
            {!top.length && <tr><td className="empty">Sem vendas no período.</td></tr>}
          </tbody></table></div></div>
          <div className="panel"><h3>Comprar (estoque baixo)</h3><div className="tw"><table><tbody>
            {baixo.map((p) => <tr key={p.id}><td>{p.nome}</td><td className="r num">{fmtQty(p.estoque)} de mín. {fmtQty(p.estoque_minimo)}</td></tr>)}
            {!baixo.length && <tr><td className="empty">Nenhum produto abaixo do mínimo.</td></tr>}
          </tbody></table></div></div>
        </div>
      )}

      <div className="panel"><h3>{verTudo ? 'Vendas' : 'Minhas vendas'}</h3><div className="tw"><table>
        <thead><tr><th>Quando</th><th>Itens</th><th>Pagamento</th><th className="r">Total</th><th /></tr></thead>
        <tbody>
          {vendas.map((v) => (
            <tr key={v.id}>
              <td className="num">{periodo === 'mes' && new Date(v.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' '}{new Date(v.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{(v.itens_venda || []).map((i) => `${fmtQty(i.qtd)}× ${i.nome}`).join(', ')}</td>
              <td>{PAY[v.pagamento]}{v.cliente_id ? ` · ${nomeCliente(v.cliente_id)}` : ''}</td>
              <td className="r num">{v.pendente && <span className="pill warn">aguardando envio</span>} {v.cancelada && <span className="pill bad">cancelada</span>} {money(v.total)}</td>
              <td className="r">{!v.cancelada && !v.pendente && can('cancelar') && (
                <ConfirmButton confirmLabel="Confirmar cancelamento" onConfirm={async () => {
                  try { await api.cancelarVenda(v.id); toast('Venda cancelada e estoque devolvido'); recarregar(); }
                  catch (e) { toast(e.tipo === 'rede' ? 'Cancelamento precisa de internet.' : e.message); }
                }}>Cancelar</ConfirmButton>
              )}</td>
            </tr>
          ))}
          {!vendas.length && <tr><td colSpan={5} className="empty">Nenhuma venda no período.</td></tr>}
        </tbody>
      </table></div></div>
    </div>
  );
}
