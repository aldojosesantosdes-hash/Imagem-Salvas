import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, configurado } from './supabase.js';
import { minhasLojas, carregarLoja, sincronizar, fila, api } from './store.js';
import { ToastProvider, useToast, iniciais } from './ui.jsx';
import { money, dayKey } from './lib/money.js';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Caixa from './pages/Caixa.jsx';
import Produtos from './pages/Produtos.jsx';
import Fiado from './pages/Fiado.jsx';
import Relatorio from './pages/Relatorio.jsx';
import Equipe from './pages/Equipe.jsx';

export default function App() {
  return (
    <ToastProvider>
      {configurado ? <Raiz /> : <SemConfiguracao />}
    </ToastProvider>
  );
}

function SemConfiguracao() {
  return (
    <div className="center"><div className="panel stack auth">
      <h2>Falta conectar ao banco</h2>
      <p className="muted">Crie o arquivo <b>.env</b> a partir do <b>.env.example</b> com a URL e a chave pública do seu projeto Supabase e reinicie o app.</p>
    </div></div>
  );
}

function Raiz() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="center muted">Carregando…</div>;
  if (!session) return <Login />;
  return <ComLogin user={session.user} />;
}

function ComLogin({ user }) {
  const toast = useToast();
  const [lojas, setLojas] = useState(null);
  const [lojaId, setLojaId] = useState(() => localStorage.getItem('loja') || '');
  const convite = useMemo(() => new URLSearchParams(location.search).get('convite'), []);

  const recarregarLojas = useCallback(async () => {
    try {
      const { data } = await minhasLojas(user.id);
      setLojas(data || []);
    } catch {
      setLojas([]);
      toast('Não foi possível carregar suas lojas. Verifique a conexão.');
    }
  }, [user.id, toast]);
  useEffect(() => { recarregarLojas(); }, [recarregarLojas]);

  useEffect(() => {
    if (!convite) return;
    const nome = user.user_metadata?.nome || user.email?.split('@')[0] || '';
    api.aceitarConvite(convite, nome)
      .then((id) => { history.replaceState(null, '', '/'); setLojaId(id); toast('Você entrou na loja.'); recarregarLojas(); })
      .catch((e) => { history.replaceState(null, '', '/'); toast(e.message || 'Convite inválido ou expirado.'); });
  }, [convite, user, toast, recarregarLojas]);

  if (lojas === null) return <div className="center muted">Carregando…</div>;
  if (!lojas.length) return <Onboarding user={user} onCriada={(id) => { setLojaId(id); recarregarLojas(); }} />;
  const atual = lojas.find((l) => l.loja_id === lojaId) || lojas[0];
  if (atual.loja_id !== lojaId) {
    try { localStorage.setItem('loja', atual.loja_id); } catch {}
  }
  return <Loja key={atual.loja_id} user={user} membro={atual} lojas={lojas} trocar={(id) => { try { localStorage.setItem('loja', id); } catch {} setLojaId(id); }} />;
}

function Loja({ user, membro, lojas, trocar }) {
  const toast = useToast();
  const lojaId = membro.loja_id;
  const isDono = membro.papel === 'dono';
  const [dados, setDados] = useState(null);
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [tab, setTab] = useState('caixa');

  const recarregar = useCallback(async () => {
    try {
      const d = await carregarLoja(lojaId);
      // vendas ainda na fila aparecem no caixa e no relatório local
      const fl = await fila.list();
      const locais = fl.filter((o) => o.tipo === 'venda' && o.dados.loja_id === lojaId).map((o) => ({ ...o.dados, pendente: true,
        total: o.dados.itens.reduce((s, i) => s + i.qtd * i.preco, 0), itens_venda: o.dados.itens, vendedor_id: user.id, cancelada: false }));
      d.vendas = [...locais, ...d.vendas.filter((v) => !locais.some((l) => l.id === v.id))];
      setDados(d);
      setPendentes(fl.length);
    } catch {
      toast('Não foi possível carregar os dados da loja.');
    }
  }, [lojaId, toast, user.id]);

  const sync = useCallback(async () => {
    const r = await sincronizar();
    setPendentes(r.pendentes);
    if (r.falhas.length) toast(`${r.falhas.length} operação(ões) recusada(s) pelo servidor. Veja em Relatório.`);
    if (r.enviadas) { toast(`${r.enviadas} operação(ões) sincronizada(s).`); await recarregar(); }
  }, [recarregar, toast]);

  useEffect(() => { recarregar().then(sync); }, [recarregar, sync]);
  useEffect(() => {
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === 'visible' && recarregar().then(sync);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(() => navigator.onLine && sync(), 30000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); document.removeEventListener('visibilitychange', vis); clearInterval(t); };
  }, [recarregar, sync]);

  if (!dados) return <div className="center muted">Carregando a loja…</div>;
  const perms = dados.permissoes || {};
  const can = (k) => isDono || !!perms[k];
  const tabs = [['caixa', 'Caixa'], can('produtos') && ['produtos', 'Produtos'], can('fiado') && ['fiado', 'Fiado'],
    ['relatorio', can('relatorio') ? 'Relatório' : 'Minhas vendas'], isDono && ['equipe', 'Loja e equipe']].filter(Boolean);
  const nomeLoja = membro.lojas?.nome || 'Minha loja';
  const hoje = dados.vendas.filter((v) => !v.cancelada && dayKey(v.data) === dayKey()).reduce((s, v) => s + Number(v.total), 0);
  const ctx = { user, lojaId, nomeLoja, isDono, can, dados, setDados, recarregar, sync, setPendentes };

  return (
    <>
      <header>
        <div className="top">
          <div className="mark" aria-hidden="true">{iniciais(nomeLoja)}</div>
          <div className="brandbox">
            <div className="brand">{nomeLoja}</div>
            <div className="who">
              {membro.nome || user.email} · {isDono ? 'Dono' : 'Funcionário'}
              {lojas.length > 1 && (
                <> · <select aria-label="Trocar de loja" value={lojaId} onChange={(e) => trocar(e.target.value)} style={{ width: 'auto', padding: '2px 6px', background: 'transparent', color: 'inherit', border: 0 }}>
                  {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.lojas?.nome}</option>)}
                </select></>
              )}
              {' · '}<button className="linkbtn" style={{ color: 'inherit' }} onClick={() => supabase.auth.signOut()}>Sair</button>
            </div>
          </div>
          {can('relatorio') && <div className="today"><span>Vendido hoje</span><b className="num">{money(hoje)}</b></div>}
        </div>
        <nav aria-label="Seções">
          {tabs.map(([k, l]) => <button key={k} type="button" aria-current={k === tab} onClick={() => setTab(k)}>{l}</button>)}
        </nav>
      </header>
      <main>
        {(!online || dados.offline || pendentes > 0) && (
          <div className="banner" style={{ marginBottom: 16 }}>
            {!online ? 'Sem internet. ' : ''}
            {pendentes > 0 ? `${pendentes} operação(ões) aguardando envio; sincroniza sozinho quando a conexão voltar.` : !online ? 'As vendas ficam guardadas no aparelho.' : 'Mostrando dados salvos no aparelho.'}
          </div>
        )}
        {tab === 'caixa' && <Caixa {...ctx} />}
        {tab === 'produtos' && <Produtos {...ctx} />}
        {tab === 'fiado' && <Fiado {...ctx} />}
        {tab === 'relatorio' && <Relatorio {...ctx} />}
        {tab === 'equipe' && <Equipe {...ctx} />}
      </main>
    </>
  );
}
