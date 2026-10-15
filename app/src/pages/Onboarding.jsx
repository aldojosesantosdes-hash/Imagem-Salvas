import React, { useState } from 'react';
import { api } from '../store.js';
import { supabase } from '../supabase.js';

export default function Onboarding({ user, onCriada }) {
  const [nome, setNome] = useState('');
  const [dono, setDono] = useState(user.user_metadata?.nome || '');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErro('');
    try {
      onCriada(await api.criarLoja(nome.trim(), dono.trim()));
    } catch (err) {
      setErro(err.tipo === 'rede' ? 'Sem internet. Conecte-se para criar a loja.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="panel stack auth" onSubmit={submit}>
        <h2>Vamos criar sua loja</h2>
        <p className="muted">Se você é funcionário, peça ao dono o link de convite em vez de criar uma loja.</p>
        <label htmlFor="loja">Nome da loja<input id="loja" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Mercadinho Nascimento" maxLength={60} required /></label>
        <label htmlFor="dono">Seu nome<input id="dono" value={dono} onChange={(e) => setDono(e.target.value)} required /></label>
        {erro && <p className="err" role="alert">{erro}</p>}
        <button className="btn primary" disabled={busy} type="submit">Criar loja</button>
        <button className="linkbtn" type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
      </form>
    </div>
  );
}
