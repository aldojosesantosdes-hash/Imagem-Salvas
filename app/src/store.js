import { get, set } from 'idb-keyval';
import { supabase } from './supabase.js';
import { createFila, ERRO_REDE } from './lib/fila.js';
import { dayKey } from './lib/money.js';

const idb = { get, set };
export const fila = createFila(idb, 'fila');

const DIAS_RELATORIO = 90;

function ehErroDeRede(error) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = String(error?.message || error || '');
  return /Failed to fetch|NetworkError|Load failed|fetch failed|ERR_INTERNET/i.test(msg);
}

async function rpc(nome, args) {
  let res;
  try {
    res = await supabase.rpc(nome, args);
  } catch (e) {
    throw ehErroDeRede(e) ? { tipo: ERRO_REDE } : e;
  }
  if (res.error) {
    if (ehErroDeRede(res.error)) throw { tipo: ERRO_REDE };
    throw new Error(res.error.message);
  }
  return res.data;
}

// Lê do servidor e guarda cópia local; sem internet, devolve a última cópia.
async function cached(chave, consulta) {
  try {
    const { data, error } = await consulta();
    if (error) throw error;
    await set(chave, data);
    return { data, offline: false };
  } catch (e) {
    const data = await get(chave);
    if (data !== undefined && ehErroDeRede(e)) return { data, offline: true };
    if (data !== undefined) return { data, offline: true };
    throw e;
  }
}

export async function minhasLojas(userId) {
  return cached(`lojas:${userId}`, () =>
    supabase.from('membros').select('loja_id, papel, nome, lojas(id, nome)').eq('usuario_id', userId).eq('ativo', true),
  );
}

export async function carregarLoja(lojaId) {
  const desde = dayKey(new Date(Date.now() - DIAS_RELATORIO * 864e5));
  const [produtos, permissoes, clientes, vendas, membros] = await Promise.all([
    cached(`produtos:${lojaId}`, () => supabase.from('produtos_caixa').select('*').eq('loja_id', lojaId).eq('ativo', true).order('nome')),
    cached(`permissoes:${lojaId}`, () => supabase.from('permissoes').select('*').eq('loja_id', lojaId).maybeSingle()),
    cached(`clientes:${lojaId}`, () => supabase.from('clientes').select('*').eq('loja_id', lojaId).order('nome')),
    cached(`vendas:${lojaId}`, () =>
      supabase.from('vendas').select('*, itens_venda(*)').eq('loja_id', lojaId).gte('data', desde).order('data', { ascending: false }),
    ),
    cached(`membros:${lojaId}`, () => supabase.from('membros').select('*').eq('loja_id', lojaId)),
  ]);
  return {
    produtos: produtos.data || [],
    permissoes: permissoes.data || {},
    clientes: clientes.data || [],
    vendas: vendas.data || [],
    membros: membros.data || [],
    offline: [produtos, permissoes, clientes, vendas, membros].some((r) => r.offline),
  };
}

// Envia a fila ao servidor (vendas e recebimentos), na ordem em que aconteceram.
export function sincronizar() {
  return fila.flush(async (op) => {
    if (op.tipo === 'venda') await rpc('registrar_venda', { p_venda: op.dados });
    else if (op.tipo === 'recebimento') await rpc('registrar_recebimento', { p: op.dados });
    else throw new Error('operação desconhecida');
  });
}

export const novaId = () => crypto.randomUUID();

export const api = {
  criarLoja: (nome, nomeDono) => rpc('criar_loja', { p_nome: nome, p_nome_dono: nomeDono }),
  aceitarConvite: (token, nome) => rpc('aceitar_convite', { p_token: token, p_nome: nome }),
  cancelarVenda: (id) => rpc('cancelar_venda', { p_id: id }),
  movimentarEstoque: (produto, qtd, motivo) => rpc('movimentar_estoque', { p_produto: produto, p_qtd: qtd, p_motivo: motivo }),
  async salvarProduto(lojaId, id, dados) {
    const q = id
      ? supabase.from('produtos').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('id', id)
      : supabase.from('produtos').insert({ ...dados, loja_id: lojaId });
    const { error } = await q;
    if (error) throw new Error(error.code === '23505' ? 'Já existe um produto com esse código.' : error.message);
  },
  async arquivarProduto(id) {
    const { error } = await supabase.from('produtos').update({ ativo: false }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async criarCliente(lojaId, nome, telefone) {
    const { error } = await supabase.from('clientes').insert({ loja_id: lojaId, nome, telefone });
    if (error) throw new Error(error.message);
  },
  async salvarPermissoes(lojaId, p) {
    const { error } = await supabase.from('permissoes').update(p).eq('loja_id', lojaId);
    if (error) throw new Error(error.message);
  },
  async renomearLoja(lojaId, nome) {
    const { error } = await supabase.from('lojas').update({ nome }).eq('id', lojaId);
    if (error) throw new Error(error.message);
  },
  async criarConvite(lojaId, userId) {
    const { data, error } = await supabase.from('convites').insert({ loja_id: lojaId, criado_por: userId }).select('token').single();
    if (error) throw new Error(error.message);
    return data.token;
  },
  async desativarMembro(lojaId, usuarioId) {
    const { error } = await supabase.from('membros').update({ ativo: false }).eq('loja_id', lojaId).eq('usuario_id', usuarioId);
    if (error) throw new Error(error.message);
  },
};
