-- Caixa de Bairro: esquema inicial
-- Cada tabela de negócio tem loja_id; RLS libera só lojas de que o usuário é membro.

create extension if not exists pgcrypto;

-- ---------- LOJAS E MEMBROS ----------
create table lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 1 and 60),
  cnpj text,
  plano text not null default 'teste',
  criada_em timestamptz not null default now()
);

create table membros (
  loja_id uuid not null references lojas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('dono', 'funcionario')),
  nome text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (loja_id, usuario_id)
);

create table permissoes (
  loja_id uuid primary key references lojas(id) on delete cascade,
  produtos boolean not null default false,
  custo boolean not null default false,
  fiado boolean not null default true,
  relatorio boolean not null default false,
  cancelar boolean not null default false
);

create table convites (
  token text primary key default encode(gen_random_bytes(12), 'hex'),
  loja_id uuid not null references lojas(id) on delete cascade,
  criado_por uuid not null references auth.users(id),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users(id),
  usado_em timestamptz
);

-- ---------- NEGÓCIO ----------
create table produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text not null,
  codigo_barras text,
  preco numeric(12,2) not null default 0 check (preco >= 0),
  custo numeric(12,2) not null default 0 check (custo >= 0),
  estoque numeric(12,3) not null default 0,
  estoque_minimo numeric(12,3) not null default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create unique index produtos_codigo_unico on produtos (loja_id, codigo_barras) where codigo_barras is not null and codigo_barras <> '' and ativo;
create index produtos_loja on produtos (loja_id);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text not null,
  telefone text,
  saldo_fiado numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
create index clientes_loja on clientes (loja_id);

create table vendas (
  id uuid primary key,               -- gerado no aparelho: reenvio offline não duplica
  loja_id uuid not null references lojas(id) on delete cascade,
  data timestamptz not null,
  total numeric(12,2) not null,
  pagamento text not null check (pagamento in ('dinheiro', 'pix', 'cartao', 'fiado')),
  cliente_id uuid references clientes(id),
  vendedor_id uuid references auth.users(id),
  cancelada boolean not null default false,
  cancelada_por uuid references auth.users(id),
  recebida_em timestamptz not null default now()
);
create index vendas_loja_data on vendas (loja_id, data desc);

create table itens_venda (
  venda_id uuid not null references vendas(id) on delete cascade,
  linha int not null,
  produto_id uuid references produtos(id),
  nome text not null,
  qtd numeric(12,3) not null check (qtd > 0),
  preco numeric(12,2) not null,
  custo numeric(12,2) not null default 0,
  primary key (venda_id, linha)
);

create table recebimentos (
  id uuid primary key,               -- gerado no aparelho
  loja_id uuid not null references lojas(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  valor numeric(12,2) not null check (valor > 0),
  data timestamptz not null,
  recebido_por uuid references auth.users(id)
);

create table movimentos_estoque (
  id bigserial primary key,
  loja_id uuid not null references lojas(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  quantidade numeric(12,3) not null,  -- negativo = saída
  motivo text not null check (motivo in ('venda', 'entrada', 'ajuste', 'cancelamento')),
  referencia uuid,
  usuario_id uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

-- Estoque atualizado por incremento atômico: dois caixas ao mesmo tempo não perdem baixa.
create function aplicar_movimento() returns trigger language plpgsql as $$
begin
  update produtos set estoque = estoque + new.quantidade, atualizado_em = now()
  where id = new.produto_id and loja_id = new.loja_id;
  return new;
end $$;
create trigger movimento_estoque after insert on movimentos_estoque
  for each row execute function aplicar_movimento();

-- ---------- FUNÇÕES DE ACESSO ----------
create function eh_membro(l uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where loja_id = l and usuario_id = auth.uid() and ativo);
$$;

create function eh_dono(l uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where loja_id = l and usuario_id = auth.uid() and ativo and papel = 'dono');
$$;

create function pode(l uuid, perm text) returns boolean language sql stable security definer set search_path = public as $$
  select eh_dono(l) or (eh_membro(l) and coalesce((
    select case perm when 'produtos' then produtos when 'custo' then custo when 'fiado' then fiado
                     when 'relatorio' then relatorio when 'cancelar' then cancelar else false end
    from permissoes where loja_id = l), false));
$$;

-- ---------- RLS ----------
alter table lojas enable row level security;
alter table membros enable row level security;
alter table permissoes enable row level security;
alter table convites enable row level security;
alter table produtos enable row level security;
alter table clientes enable row level security;
alter table vendas enable row level security;
alter table itens_venda enable row level security;
alter table recebimentos enable row level security;
alter table movimentos_estoque enable row level security;

create policy lojas_ler on lojas for select using (eh_membro(id));
create policy lojas_editar on lojas for update using (eh_dono(id));

create policy membros_ler on membros for select using (eh_membro(loja_id));
create policy membros_dono on membros for update using (eh_dono(loja_id));

create policy permissoes_ler on permissoes for select using (eh_membro(loja_id));
create policy permissoes_dono on permissoes for update using (eh_dono(loja_id));

create policy convites_dono on convites for all using (eh_dono(loja_id)) with check (eh_dono(loja_id));

create policy produtos_ler on produtos for select using (eh_membro(loja_id));
create policy produtos_inserir on produtos for insert with check (pode(loja_id, 'produtos'));
create policy produtos_editar on produtos for update using (pode(loja_id, 'produtos'));

create policy clientes_ler on clientes for select using (pode(loja_id, 'fiado'));
create policy clientes_inserir on clientes for insert with check (pode(loja_id, 'fiado'));
create policy clientes_editar on clientes for update using (pode(loja_id, 'fiado'));

create policy vendas_ler on vendas for select using (pode(loja_id, 'relatorio') or vendedor_id = auth.uid());
create policy itens_ler on itens_venda for select using (exists (
  select 1 from vendas v where v.id = venda_id and (pode(v.loja_id, 'relatorio') or v.vendedor_id = auth.uid())));
create policy recebimentos_ler on recebimentos for select using (pode(loja_id, 'fiado'));
create policy movimentos_ler on movimentos_estoque for select using (pode(loja_id, 'produtos'));
create policy movimentos_inserir on movimentos_estoque for insert
  with check (pode(loja_id, 'produtos') and motivo in ('entrada', 'ajuste') and usuario_id = auth.uid());

-- Custo só para quem tem permissão: view sem a coluna para os demais.
create view produtos_caixa with (security_invoker = true) as
  select id, loja_id, nome, codigo_barras, preco,
         case when pode(loja_id, 'custo') then custo end as custo,
         estoque, estoque_minimo, ativo, atualizado_em
  from produtos;

-- ---------- OPERAÇÕES (transação única, chamadas via RPC) ----------

-- Cria a loja e torna quem chamou o dono.
create function criar_loja(p_nome text, p_nome_dono text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  insert into lojas (nome) values (trim(p_nome)) returning id into v_id;
  insert into membros (loja_id, usuario_id, papel, nome) values (v_id, auth.uid(), 'dono', coalesce(p_nome_dono, ''));
  insert into permissoes (loja_id) values (v_id);
  return v_id;
end $$;

-- Funcionário entra na loja pelo link de convite (uso único, validade de 7 dias).
create function aceitar_convite(p_token text, p_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c convites;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  select * into c from convites where token = p_token for update;
  if not found or c.usado_por is not null or c.expira_em < now() then
    raise exception 'convite inválido ou expirado';
  end if;
  insert into membros (loja_id, usuario_id, papel, nome) values (c.loja_id, auth.uid(), 'funcionario', coalesce(p_nome, ''))
    on conflict (loja_id, usuario_id) do update set ativo = true;
  update convites set usado_por = auth.uid(), usado_em = now() where token = p_token;
  return c.loja_id;
end $$;

-- Registra venda: idempotente pelo id do aparelho. Preço e custo vêm do app (preço da hora da venda),
-- mas o produto precisa ser da mesma loja.
create function registrar_venda(p_venda jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (p_venda->>'id')::uuid;
  v_loja uuid := (p_venda->>'loja_id')::uuid;
  v_pag text := p_venda->>'pagamento';
  v_cli uuid := nullif(p_venda->>'cliente_id', '')::uuid;
  v_total numeric(12,2) := 0;
  it jsonb; n int := 0;
begin
  if not eh_membro(v_loja) then raise exception 'sem acesso a esta loja'; end if;
  if exists (select 1 from vendas where id = v_id) then return 'duplicada'; end if;
  if v_pag = 'fiado' then
    if not pode(v_loja, 'fiado') then raise exception 'fiado não liberado'; end if;
    if not exists (select 1 from clientes where id = v_cli and loja_id = v_loja) then raise exception 'cliente inválido'; end if;
  else
    v_cli := null;
  end if;
  for it in select * from jsonb_array_elements(p_venda->'itens') loop
    v_total := v_total + round((it->>'qtd')::numeric * (it->>'preco')::numeric, 2);
  end loop;
  if jsonb_array_length(p_venda->'itens') = 0 then raise exception 'venda sem itens'; end if;

  insert into vendas (id, loja_id, data, total, pagamento, cliente_id, vendedor_id)
  values (v_id, v_loja, coalesce((p_venda->>'data')::timestamptz, now()), v_total, v_pag, v_cli, auth.uid());

  for it in select * from jsonb_array_elements(p_venda->'itens') loop
    n := n + 1;
    insert into itens_venda (venda_id, linha, produto_id, nome, qtd, preco, custo)
    select v_id, n, p.id, coalesce(it->>'nome', p.nome), (it->>'qtd')::numeric, (it->>'preco')::numeric, p.custo
    from produtos p where p.id = (it->>'produto_id')::uuid and p.loja_id = v_loja;
    if not found then raise exception 'produto inválido na venda'; end if;
    insert into movimentos_estoque (loja_id, produto_id, quantidade, motivo, referencia, usuario_id)
    values (v_loja, (it->>'produto_id')::uuid, -(it->>'qtd')::numeric, 'venda', v_id, auth.uid());
  end loop;

  if v_cli is not null then
    update clientes set saldo_fiado = saldo_fiado + v_total where id = v_cli;
  end if;
  return 'ok';
end $$;

create function cancelar_venda(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v vendas; it itens_venda;
begin
  select * into v from vendas where id = p_id for update;
  if not found or not pode(v.loja_id, 'cancelar') then raise exception 'sem permissão'; end if;
  if v.cancelada then return; end if;
  update vendas set cancelada = true, cancelada_por = auth.uid() where id = p_id;
  for it in select * from itens_venda where venda_id = p_id loop
    if it.produto_id is not null then
      insert into movimentos_estoque (loja_id, produto_id, quantidade, motivo, referencia, usuario_id)
      values (v.loja_id, it.produto_id, it.qtd, 'cancelamento', p_id, auth.uid());
    end if;
  end loop;
  if v.cliente_id is not null then
    update clientes set saldo_fiado = greatest(0, saldo_fiado - v.total) where id = v.cliente_id;
  end if;
end $$;

-- Recebimento de fiado: idempotente pelo id do aparelho.
create function registrar_recebimento(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_loja uuid := (p->>'loja_id')::uuid; v_cli uuid := (p->>'cliente_id')::uuid; v_val numeric(12,2) := (p->>'valor')::numeric;
begin
  if not pode(v_loja, 'fiado') then raise exception 'fiado não liberado'; end if;
  if exists (select 1 from recebimentos where id = (p->>'id')::uuid) then return 'duplicada'; end if;
  if not exists (select 1 from clientes where id = v_cli and loja_id = v_loja) then raise exception 'cliente inválido'; end if;
  insert into recebimentos (id, loja_id, cliente_id, valor, data, recebido_por)
  values ((p->>'id')::uuid, v_loja, v_cli, v_val, coalesce((p->>'data')::timestamptz, now()), auth.uid());
  update clientes set saldo_fiado = greatest(0, saldo_fiado - v_val) where id = v_cli;
  return 'ok';
end $$;

-- Entrada ou ajuste de estoque pela tela de produtos.
create function movimentar_estoque(p_produto uuid, p_qtd numeric, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_loja uuid;
begin
  select loja_id into v_loja from produtos where id = p_produto;
  if v_loja is null or not pode(v_loja, 'produtos') then raise exception 'sem permissão'; end if;
  if p_motivo not in ('entrada', 'ajuste') then raise exception 'motivo inválido'; end if;
  insert into movimentos_estoque (loja_id, produto_id, quantidade, motivo, usuario_id)
  values (v_loja, p_produto, p_qtd, p_motivo, auth.uid());
end $$;

revoke all on function criar_loja, aceitar_convite, registrar_venda, cancelar_venda, registrar_recebimento, movimentar_estoque from public, anon;
grant execute on function criar_loja, aceitar_convite, registrar_venda, cancelar_venda, registrar_recebimento, movimentar_estoque to authenticated;
