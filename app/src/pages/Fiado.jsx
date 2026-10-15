import React, { useMemo, useState } from 'react';
import { useToast } from '../ui.jsx';
import { money, parseNum } from '../lib/money.js';
import { textoFiado, linkWhatsApp } from '../lib/recibo.js';
import { api, fila, novaId } from '../store.js';

export default function Fiado({ lojaId, nomeLoja, dados, setDados, recarregar, sync, setPendentes }) {
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [rCli, setRCli] = useState('');
  const [rVal, setRVal] = useState('');
  const [ultimo, setUltimo] = useState(null);
  const clientes = useMemo(() => [...dados.clientes].sort((a, b) => b.saldo_fiado - a.saldo_fiado || a.nome.localeCompare(b.nome, 'pt-BR')), [dados.clientes]);
  const aberto = clientes.reduce((s, c) => s + Number(c.saldo_fiado), 0);

  async function cadastrar(e) {
    e.preventDefault();
    try { await api.criarCliente(lojaId, nome.trim(), tel.trim()); setNome(''); setTel(''); toast('Cliente cadastrado'); recarregar(); }
    catch (err) { toast(err.message); }
  }

  async function receber(e) {
    e.preventDefault();
    const c = clientes.find((x) => x.id === rCli); const v = parseNum(rVal);
    if (!c || v <= 0) return toast('Escolha o cliente e o valor.');
    const dadosRec = { id: novaId(), loja_id: lojaId, cliente_id: c.id, valor: v, data: new Date().toISOString() };
    await fila.enqueue({ id: dadosRec.id, tipo: 'recebimento', dados: dadosRec });
    const saldo = Math.max(0, Number(c.saldo_fiado) - v);
    setDados((d) => ({ ...d, clientes: d.clientes.map((x) => (x.id === c.id ? { ...x, saldo_fiado: saldo } : x)) }));
    setUltimo({ c, v, saldo });
    setRVal('');
    toast(`Recebido ${money(v)} de ${c.nome}`);
    setPendentes((n) => n + 1);
    sync();
  }

  return (
    <div className="cols">
      <div className="panel stack">
        <h2>Caderneta do fiado</h2>
        <p className="muted num">Total a receber: <b>{money(aberto)}</b></p>
        <div className="tw"><table>
          <thead><tr><th>Cliente</th><th>Telefone</th><th className="r">Deve</th><th /></tr></thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td><td className="num">{c.telefone}</td>
                <td className="r num">{Number(c.saldo_fiado) > 0.004 ? <span className="pill bad">{money(c.saldo_fiado)}</span> : <span className="pill good">em dia</span>}</td>
                <td className="r"><button className="btn" type="button" onClick={() => { setRCli(c.id); document.getElementById('rVal')?.focus(); }}>Receber</button></td>
              </tr>
            ))}
            {!clientes.length && <tr><td colSpan={4} className="empty">Nenhum cliente na caderneta. Cadastre ao lado.</td></tr>}
          </tbody>
        </table></div>
      </div>
      <div className="stack">
        <form className="panel stack" onSubmit={receber}>
          <h2>Receber pagamento</h2>
          <label htmlFor="rCli">Cliente<select id="rCli" value={rCli} onChange={(e) => setRCli(e.target.value)}>
            <option value="">Escolha…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome} ({money(c.saldo_fiado)})</option>)}
          </select></label>
          <label htmlFor="rVal">Valor recebido<input id="rVal" inputMode="decimal" value={rVal} onChange={(e) => setRVal(e.target.value)} required /></label>
          <button className="btn primary" type="submit">Registrar pagamento</button>
          {ultimo && (
            <a className="btn" style={{ textDecoration: 'none', textAlign: 'center' }} target="_blank" rel="noreferrer"
              href={linkWhatsApp(ultimo.c.telefone, textoFiado({ loja: nomeLoja, cliente: ultimo.c.nome, total: ultimo.v, saldo: ultimo.saldo, tipo: 'pagamento' }))}>
              Enviar recibo no WhatsApp
            </a>
          )}
        </form>
        <form className="panel stack" onSubmit={cadastrar}>
          <h2>Novo cliente</h2>
          <label htmlFor="cNome">Nome<input id="cNome" value={nome} onChange={(e) => setNome(e.target.value)} required /></label>
          <label htmlFor="cTel">WhatsApp<input id="cTel" inputMode="tel" placeholder="(71) 98888-7777" value={tel} onChange={(e) => setTel(e.target.value)} /></label>
          <button className="btn primary" type="submit">Cadastrar cliente</button>
        </form>
      </div>
    </div>
  );
}
