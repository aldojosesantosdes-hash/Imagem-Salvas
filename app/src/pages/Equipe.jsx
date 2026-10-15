import React, { useState } from 'react';
import { useToast, ConfirmButton } from '../ui.jsx';
import { api } from '../store.js';

const PERMS = [
  ['produtos', 'Cadastrar produtos e lançar estoque'],
  ['custo', 'Ver preço de custo e lucro'],
  ['fiado', 'Usar a caderneta do fiado'],
  ['relatorio', 'Ver relatório de todas as vendas'],
  ['cancelar', 'Cancelar vendas'],
];

export default function Equipe({ user, lojaId, nomeLoja, dados, recarregar }) {
  const toast = useToast();
  const [nome, setNome] = useState(nomeLoja);
  const [perms, setPerms] = useState(() => Object.fromEntries(PERMS.map(([k]) => [k, !!dados.permissoes?.[k]])));
  const [link, setLink] = useState('');

  async function gerarConvite() {
    try {
      const token = await api.criarConvite(lojaId, user.id);
      setLink(`${location.origin}/?convite=${token}`);
    } catch (e) { toast(e.message); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(link); toast('Link copiado'); }
    catch { toast('Selecione o link e copie manualmente.'); }
  }

  return (
    <div className="cols">
      <div className="stack">
        <div className="panel stack">
          <h2>Sua loja</h2>
          <div className="row">
            <label htmlFor="lNome">Nome da loja<input id="lNome" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} /></label>
            <button className="btn primary" type="button" onClick={async () => {
              try { await api.renomearLoja(lojaId, nome.trim()); toast('Nome salvo. Ele aparece ao recarregar.'); } catch (e) { toast(e.message); }
            }}>Salvar</button>
          </div>
        </div>
        <div className="panel stack">
          <h2>O que os funcionários podem fazer</h2>
          <p className="muted">Vender no caixa é sempre liberado. Você, como dono, faz tudo.</p>
          {PERMS.map(([k, l]) => (
            <label key={k} className="switch" htmlFor={'perm-' + k}>
              <input type="checkbox" id={'perm-' + k} checked={perms[k]} onChange={(e) => setPerms((p) => ({ ...p, [k]: e.target.checked }))} /> {l}
            </label>
          ))}
          <div><button className="btn primary" type="button" onClick={async () => {
            try { await api.salvarPermissoes(lojaId, perms); toast('Permissões salvas'); recarregar(); } catch (e) { toast(e.message); }
          }}>Salvar permissões</button></div>
        </div>
      </div>
      <div className="stack">
        <div className="panel stack">
          <h2>Convidar funcionário</h2>
          <p className="muted">Gere um link e envie pelo WhatsApp. Ele vale para uma pessoa, por 7 dias.</p>
          <button className="btn primary" type="button" onClick={gerarConvite}>Gerar link de convite</button>
          {link && <>
            <div className="code">{link}</div>
            <div className="row">
              <button className="btn" type="button" onClick={copiar}>Copiar link</button>
              <a className="btn" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(`Convite para o caixa da ${nomeLoja}: ${link}`)}`}>Enviar no WhatsApp</a>
            </div>
          </>}
        </div>
        <div className="panel stack">
          <h2>Equipe</h2>
          <div className="tw"><table><tbody>
            {dados.membros.filter((m) => m.ativo).map((m) => (
              <tr key={m.usuario_id}>
                <td>{m.nome || 'Sem nome'}{m.usuario_id === user.id && ' (você)'}</td>
                <td><span className="pill">{m.papel === 'dono' ? 'Dono' : 'Funcionário'}</span></td>
                <td className="r">{m.papel !== 'dono' && (
                  <ConfirmButton confirmLabel="Confirmar remoção" onConfirm={async () => {
                    try { await api.desativarMembro(lojaId, m.usuario_id); toast('Funcionário removido'); recarregar(); } catch (e) { toast(e.message); }
                  }}>Remover</ConfirmButton>
                )}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      </div>
    </div>
  );
}
