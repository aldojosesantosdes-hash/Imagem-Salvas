-- Testes do esquema. Cada bloco levanta exceção ('FALHA: ...') se uma regra quebrar.
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
create function como(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function var(k text) returns text language sql as $$ select current_setting('t.' || k) $$;
grant execute on function como, var to authenticated;
set role authenticated;

-- Preparação: A e B criam lojas; A cadastra produto e cliente
select como('00000000-0000-0000-0000-00000000000a');
select set_config('t.loja_a', criar_loja('Mercadinho A', 'Ana')::text, false);
select como('00000000-0000-0000-0000-00000000000b');
select set_config('t.loja_b', criar_loja('Mercadinho B', 'Beto')::text, false);
select como('00000000-0000-0000-0000-00000000000a');
insert into produtos (id, loja_id, nome, codigo_barras, preco, custo, estoque) values
  ('11111111-1111-1111-1111-111111111111', var('loja_a')::uuid, 'Arroz', '789', 27.90, 21.50, 20);
insert into clientes (id, loja_id, nome) values ('22222222-2222-2222-2222-222222222222', var('loja_a')::uuid, 'Cliente A');

-- 1. Isolamento entre lojas
select como('00000000-0000-0000-0000-00000000000b');
do $$ declare ok boolean := false; begin
  if (select count(*) from produtos) <> 0 then raise exception 'FALHA: B vê produtos de A'; end if;
  if (select count(*) from clientes) <> 0 then raise exception 'FALHA: B vê clientes de A'; end if;
  update produtos set preco = 0 where id = '11111111-1111-1111-1111-111111111111';
  begin
    perform registrar_venda(jsonb_build_object('id', gen_random_uuid(), 'loja_id', var('loja_a'), 'pagamento', 'pix',
      'itens', jsonb_build_array(jsonb_build_object('produto_id', '11111111-1111-1111-1111-111111111111', 'qtd', 1, 'preco', 1))));
  exception when others then ok := true; end;
  if not ok then raise exception 'FALHA: B registrou venda na loja A'; end if;
  ok := false;
  begin
    perform registrar_venda(jsonb_build_object('id', gen_random_uuid(), 'loja_id', var('loja_b'), 'pagamento', 'pix',
      'itens', jsonb_build_array(jsonb_build_object('produto_id', '11111111-1111-1111-1111-111111111111', 'qtd', 1, 'preco', 1))));
  exception when others then ok := true; end;
  if not ok then raise exception 'FALHA: B vendeu produto de A pela loja B'; end if;
  raise notice 'ok 1 - isolamento entre lojas';
end $$;
select como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select preco from produtos where id = '11111111-1111-1111-1111-111111111111') <> 27.90 then raise exception 'FALHA: B alterou preço de A'; end if;
end $$;

-- 2. Venda idempotente (reenvio offline não duplica) e baixa de estoque
do $$ declare v jsonb; r1 text; r2 text; begin
  v := jsonb_build_object('id', '33333333-3333-3333-3333-333333333333', 'loja_id', var('loja_a'), 'pagamento', 'dinheiro',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', '11111111-1111-1111-1111-111111111111', 'qtd', 2, 'preco', 27.90)));
  r1 := registrar_venda(v); r2 := registrar_venda(v);
  if r1 <> 'ok' or r2 <> 'duplicada' then raise exception 'FALHA: idempotência (% / %)', r1, r2; end if;
  if (select count(*) from vendas) <> 1 then raise exception 'FALHA: venda duplicada'; end if;
  if (select estoque from produtos where id = '11111111-1111-1111-1111-111111111111') <> 18 then raise exception 'FALHA: estoque'; end if;
  if (select total from vendas) <> 55.80 then raise exception 'FALHA: total calculado no servidor'; end if;
  raise notice 'ok 2 - venda idempotente, total e estoque';
end $$;

-- 3. Fiado, recebimento e cancelamento
do $$ begin
  perform registrar_venda(jsonb_build_object('id', '44444444-4444-4444-4444-444444444444', 'loja_id', var('loja_a'), 'pagamento', 'fiado',
    'cliente_id', '22222222-2222-2222-2222-222222222222',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', '11111111-1111-1111-1111-111111111111', 'qtd', 1, 'preco', 27.90))));
  if (select saldo_fiado from clientes) <> 27.90 then raise exception 'FALHA: saldo do fiado'; end if;
  perform registrar_recebimento(jsonb_build_object('id', '55555555-5555-5555-5555-555555555555', 'loja_id', var('loja_a'),
    'cliente_id', '22222222-2222-2222-2222-222222222222', 'valor', 10));
  perform registrar_recebimento(jsonb_build_object('id', '55555555-5555-5555-5555-555555555555', 'loja_id', var('loja_a'),
    'cliente_id', '22222222-2222-2222-2222-222222222222', 'valor', 10));
  if (select saldo_fiado from clientes) <> 17.90 then raise exception 'FALHA: recebimento duplicado ou errado'; end if;
  perform cancelar_venda('44444444-4444-4444-4444-444444444444');
  perform cancelar_venda('44444444-4444-4444-4444-444444444444');
  if (select estoque from produtos) <> 18 then raise exception 'FALHA: estoque após cancelamento'; end if;
  if (select saldo_fiado from clientes) <> 0 then raise exception 'FALHA: saldo após cancelamento'; end if;
  raise notice 'ok 3 - fiado, recebimento idempotente, cancelamento';
end $$;

-- 4. Convite e permissões do funcionário (C)
with x as (insert into convites (loja_id, criado_por) values (var('loja_a')::uuid, auth.uid()) returning token)
select set_config('t.token', token, false) from x;
select como('00000000-0000-0000-0000-00000000000c');
select aceitar_convite(var('token'), 'Caio') is not null as entrou;
do $$ declare ok boolean := false; begin
  begin perform aceitar_convite(var('token'), 'Caio'); exception when others then ok := true; end;
  if not ok then raise exception 'FALHA: convite reutilizado'; end if;
  if (select count(*) from produtos) <> 1 then raise exception 'FALHA: funcionário não vê produtos'; end if;
  if (select custo from produtos_caixa limit 1) is not null then raise exception 'FALHA: funcionário vê custo'; end if;
  if (select count(*) from clientes) <> 1 then raise exception 'FALHA: fiado padrão deveria estar liberado'; end if;
  if (select count(*) from vendas) <> 0 then raise exception 'FALHA: funcionário vê relatório de vendas alheias'; end if;
  ok := false;
  begin insert into produtos (loja_id, nome) values (var('loja_a')::uuid, 'Proibido');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALHA: funcionário cadastrou produto sem permissão'; end if;
  raise notice 'ok 4 - convite de uso único e permissões do funcionário';
end $$;
do $$ declare ok boolean := false; begin
  update permissoes set produtos = true;
  begin perform cancelar_venda('33333333-3333-3333-3333-333333333333'); exception when others then ok := true; end;
  if not ok then raise exception 'FALHA: funcionário cancelou venda sem permissão'; end if;
  perform registrar_venda(jsonb_build_object('id', gen_random_uuid(), 'loja_id', var('loja_a'), 'pagamento', 'pix',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', '11111111-1111-1111-1111-111111111111', 'qtd', 1, 'preco', 27.90))));
  if (select count(*) from vendas) <> 1 then raise exception 'FALHA: funcionário deveria ver a própria venda'; end if;
  raise notice 'ok 5 - funcionário vende, vê só a própria venda, não muda permissões nem cancela';
end $$;
select como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select produtos from permissoes) then raise exception 'FALHA: funcionário alterou permissões'; end if;
  if (select estoque from produtos where nome = 'Arroz') <> 17 then raise exception 'FALHA: estoque final'; end if;
  raise notice 'ok 6 - permissões intactas e estoque final correto';
end $$;
