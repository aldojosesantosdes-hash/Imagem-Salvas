import React, { useMemo, useState } from 'react';
import { useToast, ConfirmButton } from '../ui.jsx';
import { money, fmtQty, fmtInput, parseNum } from '../lib/money.js';
import { api } from '../store.js';

const VAZIO = { nome: '', codigo_barras: '', preco: '', custo: '', estoque: '', estoque_minimo: '' };

export default function Produtos({ lojaId, can, dados, recarregar }) {
  const toast = useToast();
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState(VAZIO);
  const [editId, setEditId] = useState(null);
  const [entrada, setEntrada] = useState('');
  const verCusto = can('custo');
  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return dados.produtos.filter((p) => !q || p.nome.toLowerCase().includes(q) || (p.codigo_barras || '').includes(q));
  }, [filtro, dados.produtos]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function editar(p) {
    setEditId(p.id);
    setEntrada('');
    setForm({ nome: p.nome, codigo_barras: p.codigo_barras || '', preco: fmtInput(p.preco), custo: p.custo == null ? '' : fmtInput(p.custo),
      estoque: fmtQty(p.estoque), estoque_minimo: p.estoque_minimo ? fmtQty(p.estoque_minimo) : '' });
  }
  function limpar() { setEditId(null); setForm(VAZIO); setEntrada(''); }

  async function salvar(e) {
    e.preventDefault();
    const d = { nome: form.nome.trim(), codigo_barras: form.codigo_barras.trim() || null, preco: parseNum(form.preco), estoque_minimo: parseNum(form.estoque_minimo) };
    if (verCusto) d.custo = parseNum(form.custo);
    if (!editId) d.estoque = parseNum(form.estoque); // depois do cadastro, estoque muda só por movimento
    try {
      await api.salvarProduto(lojaId, editId, d);
      toast(editId ? 'Produto atualizado' : 'Produto cadastrado');
      limpar();
      recarregar();
    } catch (err) { toast(err.message); }
  }

  async function lancarEntrada(sinal) {
    const q = parseNum(entrada);
    if (!q) return toast('Digite a quantidade.');
    try {
      await api.movimentarEstoque(editId, q * sinal, sinal > 0 ? 'entrada' : 'ajuste');
      toast(sinal > 0 ? 'Entrada registrada' : 'Ajuste registrado');
      setEntrada('');
      await recarregar();
      limpar();
    } catch (err) { toast(err.tipo === 'rede' ? 'Sem internet. Tente de novo quando conectar.' : err.message); }
  }

  return (
    <div className="cols">
      <div className="panel stack">
        <h2>Produtos e estoque</h2>
        <input aria-label="Filtrar produtos" placeholder="Filtrar por nome ou código" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <div className="tw"><table>
          <thead><tr><th>Produto</th><th className="r">Preço</th>{verCusto && <th className="r">Custo</th>}<th className="r">Estoque</th><th /></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}{p.codigo_barras && <div className="muted num">{p.codigo_barras}</div>}</td>
                <td className="r num">{money(p.preco)}</td>
                {verCusto && <td className="r num">{money(p.custo)}</td>}
                <td className="r num">{fmtQty(p.estoque)} {Number(p.estoque_minimo) > 0 && Number(p.estoque) <= Number(p.estoque_minimo) && <span className="pill warn">baixo</span>}</td>
                <td className="r"><button className="btn" type="button" onClick={() => editar(p)}>Editar</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5} className="empty">{dados.produtos.length ? 'Nada encontrado.' : 'Cadastre o primeiro produto no formulário.'}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="stack">
        <form className="panel stack" onSubmit={salvar}>
          <h2>{editId ? 'Editar produto' : 'Novo produto'}</h2>
          <label htmlFor="pNome">Nome<input id="pNome" value={form.nome} onChange={set('nome')} required /></label>
          <label htmlFor="pCod">Código de barras (opcional)<input id="pCod" value={form.codigo_barras} onChange={set('codigo_barras')} placeholder="Passe o leitor aqui"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), document.getElementById('pPreco').focus())} /></label>
          <div className="row">
            <label htmlFor="pPreco">Preço de venda<input id="pPreco" inputMode="decimal" value={form.preco} onChange={set('preco')} required /></label>
            {verCusto && <label htmlFor="pCusto">Custo<input id="pCusto" inputMode="decimal" value={form.custo} onChange={set('custo')} /></label>}
          </div>
          <div className="row">
            {!editId && <label htmlFor="pEst">Estoque inicial<input id="pEst" inputMode="decimal" value={form.estoque} onChange={set('estoque')} /></label>}
            <label htmlFor="pMin">Avisar abaixo de<input id="pMin" inputMode="decimal" value={form.estoque_minimo} onChange={set('estoque_minimo')} /></label>
          </div>
          <div className="row">
            <button className="btn primary" type="submit">Salvar produto</button>
            {editId && <button className="btn" type="button" onClick={limpar}>Cancelar</button>}
            {editId && <ConfirmButton onConfirm={async () => { try { await api.arquivarProduto(editId); toast('Produto removido'); limpar(); recarregar(); } catch (e) { toast(e.message); } }}>Remover</ConfirmButton>}
          </div>
        </form>
        {editId && (
          <div className="panel stack">
            <h2>Chegou mercadoria?</h2>
            <label htmlFor="ent">Quantidade<input id="ent" inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} /></label>
            <div className="row">
              <button className="btn primary" type="button" onClick={() => lancarEntrada(1)}>Somar ao estoque</button>
              <button className="btn" type="button" onClick={() => lancarEntrada(-1)}>Tirar (perda ou ajuste)</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
