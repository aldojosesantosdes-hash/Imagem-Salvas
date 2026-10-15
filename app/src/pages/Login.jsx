import React, { useState } from 'react';
import { supabase } from '../supabase.js';

export default function Login() {
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErro(''); setAviso(''); setBusy(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error('E-mail ou senha incorretos.');
      } else if (modo === 'criar') {
        if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        const { data, error } = await supabase.auth.signUp({
          email, password: senha,
          options: { data: { nome }, emailRedirectTo: location.href },
        });
        if (error) throw new Error(error.message);
        if (!data.session) setAviso('Enviamos um link de confirmação para o seu e-mail. Abra o link e depois entre aqui.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw new Error(error.message);
        setAviso('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setBusy(false);
    }
  }

  const convite = new URLSearchParams(location.search).has('convite');
  return (
    <div className="center">
      <form className="panel stack auth" onSubmit={submit}>
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="mark" aria-hidden="true">CB</div>
          <h2>Caixa de Bairro</h2>
        </div>
        {convite && <p className="banner">Você recebeu um convite. Entre ou crie sua conta para participar da loja.</p>}
        {modo === 'criar' && <label htmlFor="nome">Seu nome<input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required /></label>}
        <label htmlFor="email">E-mail<input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {modo !== 'recuperar' && (
          <label htmlFor="senha">Senha<input id="senha" type="password" autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
        )}
        {erro && <p className="err" role="alert">{erro}</p>}
        {aviso && <p className="banner">{aviso}</p>}
        <button className="btn primary" disabled={busy} type="submit">
          {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
        </button>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {modo !== 'entrar' && <button type="button" className="linkbtn" onClick={() => setModo('entrar')}>Já tenho conta</button>}
          {modo !== 'criar' && <button type="button" className="linkbtn" onClick={() => setModo('criar')}>Criar conta</button>}
          {modo === 'entrar' && <button type="button" className="linkbtn" onClick={() => setModo('recuperar')}>Esqueci a senha</button>}
        </div>
      </form>
    </div>
  );
}
