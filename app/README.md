# Caixa de Bairro

Caixa, estoque e fiado para o mercadinho de bairro. App web instalável (PWA) que funciona no celular, tablet e computador, inclusive sem internet.

## O que já faz (etapas 2 e 3)

- Conta do dono, criação da loja e convite de funcionários por link (uso único, 7 dias).
- Caixa com leitor de código de barras (`3*789...` lança 3 unidades), busca por nome, troco e quatro formas de pagamento.
- Produtos, entrada de mercadoria, ajuste de estoque e alerta de estoque baixo.
- Fiado: clientes, saldo, recebimentos e comprovante pelo WhatsApp.
- Relatório do dia e do mês, lucro, mais vendidos, lista de compras, cancelamento e exportação em planilha.
- Permissões: o dono escolhe o que cada funcionário pode fazer. Funcionário sem permissão de relatório vê só as próprias vendas.
- Sem internet: vendas e recebimentos ficam guardados no aparelho e são enviados sozinhos quando a conexão volta, sem duplicar.

## Colocar no ar

1. **Supabase:** crie um projeto gratuito em [supabase.com](https://supabase.com). Em *SQL Editor*, cole e rode o conteúdo de `supabase/migrations/0001_init.sql`.
2. **Login por e-mail:** em *Authentication > URL Configuration*, coloque o endereço onde o app vai ficar (ex.: `https://caixa.seudominio.com.br`) em *Site URL* e em *Redirect URLs*.
3. **Chaves:** copie `.env.example` para `.env` e preencha com a *Project URL* e a chave **anon** (Settings > API). Nunca use a chave `service_role` no app.
4. **Rodar no computador:** `npm install` e depois `npm run dev`.
5. **Publicar:** `npm run build` gera a pasta `dist/`. Publique em Netlify, Vercel ou similar e configure as duas variáveis `VITE_SUPABASE_*` no painel do serviço.

## Testes

| Comando | O que verifica |
| --- | --- |
| `npm test` | Lógica do carrinho, valores em reais, fila sem internet, comprovante do WhatsApp |
| `npm run test:db` | Banco num Postgres local (porta 5499): isolamento entre lojas, venda sem duplicar, fiado, cancelamento, convite, permissões e 40 vendas simultâneas |

## Como a segurança funciona

Cada tabela tem `loja_id`, e as regras do banco (Row Level Security) só liberam dados das lojas de que a pessoa é membro. Venda, recebimento, cancelamento e movimento de estoque passam por funções no banco que conferem a permissão e gravam tudo numa transação só. O estoque muda por incremento, então dois caixas vendendo ao mesmo tempo não perdem baixa.

## Limites conhecidos

- Não emite NFC-e (etapa 5) nem cobra assinatura (etapa 4).
- O estoque pode ficar negativo se vender mais do que o cadastrado; o app mostra o número, mas não bloqueia a venda.
- Cancelar venda, cadastrar produto e lançar estoque exigem internet. Vender e receber fiado, não.
