// Fila de operações para funcionar sem internet.
// Cada operação tem um id gerado no aparelho; o servidor ignora reenvios (idempotente),
// então é seguro reenviar depois de uma queda no meio do envio.

export const ERRO_REDE = 'rede';

export function createFila(storage, key = 'fila') {
  let busy = false;

  async function list() {
    return (await storage.get(key)) || [];
  }

  async function enqueue(op) {
    const ops = await list();
    if (!ops.some((o) => o.id === op.id)) ops.push({ ...op, tentativas: 0 });
    await storage.set(key, ops);
    return ops.length;
  }

  // send(op) deve resolver em sucesso, rejeitar com {tipo: 'rede'} em falha de conexão,
  // ou rejeitar com outro erro quando o servidor recusar (vai para a lista de falhas).
  async function flush(send) {
    if (busy) return { enviadas: 0, pendentes: (await list()).length, falhas: [] };
    busy = true;
    let enviadas = 0;
    const falhas = [];
    try {
      for (;;) {
        const ops = await list();
        if (!ops.length) break;
        const op = ops[0];
        try {
          await send(op);
          enviadas += 1;
        } catch (e) {
          if (e && e.tipo === ERRO_REDE) break; // sem internet: tenta depois, na mesma ordem
          falhas.push({ op, erro: String(e?.message || e) });
          const rejeitadas = (await storage.get(key + ':falhas')) || [];
          rejeitadas.push({ op, erro: String(e?.message || e), em: new Date().toISOString() });
          await storage.set(key + ':falhas', rejeitadas);
        }
        const rest = (await list()).filter((o) => o.id !== op.id);
        await storage.set(key, rest);
      }
    } finally {
      busy = false;
    }
    return { enviadas, pendentes: (await list()).length, falhas };
  }

  return { enqueue, flush, list, falhas: async () => (await storage.get(key + ':falhas')) || [] };
}

export function memoryStorage() {
  const m = new Map();
  return { get: async (k) => structuredClone(m.get(k)), set: async (k, v) => void m.set(k, structuredClone(v)) };
}
