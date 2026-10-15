#!/usr/bin/env bash
# 40 vendas de 1 unidade em paralelo (8 conexões); o estoque deve cair exatamente 40.
set -euo pipefail
PORT=${1:-5499}; HOST=${2:-/var/tmp}
P="psql -X -qtA -h $HOST -p $PORT -U postgres -d caixa_test"
LOJA=$($P -c "select id from lojas where nome='Mercadinho A'")
ANTES=$($P -c "select estoque from produtos where nome='Arroz'")
seq 40 | xargs -P 8 -I{} $P -c "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
 select registrar_venda(jsonb_build_object('id', gen_random_uuid(), 'loja_id', '$LOJA', 'pagamento','pix',
 'itens', jsonb_build_array(jsonb_build_object('produto_id','11111111-1111-1111-1111-111111111111','qtd',1,'preco',27.90))));" >/dev/null
DEPOIS=$($P -c "select estoque from produtos where nome='Arroz'")
python3 -c "import sys; a,b=float('$ANTES'),float('$DEPOIS'); print(('ok' if a-b==40 else 'FALHA'), '7 - concorrência: estoque', a, '->', b)"
