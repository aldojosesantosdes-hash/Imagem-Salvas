# Demo de detecção de vivacidade (liveness)

Protótipo que roda no navegador e confirma que há uma pessoa real diante da câmera, usando **desafios ativos aleatórios**. Serve de base para proteger o cadastro ou o acesso de um sistema próprio.

Nenhuma imagem é gravada ou enviada: o processamento é local (MediaPipe Face Landmarker).

## Como rodar

```bash
npm test      # testes da lógica (Node 18+)
npm start     # http://localhost:8080
```

A câmera exige `https` ou `localhost`. O primeiro carregamento baixa o modelo (~4 MB) de CDN.

## Como funciona

| Camada | Implementação | O que bloqueia |
|---|---|---|
| Desafios aleatórios | 3 de 4 (piscar, virar à esquerda, virar à direita, sorrir), ordem sorteada por sessão, 8 s cada | Replay de vídeo gravado, pois a ordem muda a cada tentativa |
| Estado inicial exigido | Olhos abertos, rosto neutro e de frente antes de cada ação | Imagens que já "nascem" no estado final |
| Piscada válida | Fecha e abre em menos de 1 s | Olho fechado parado |
| Passiva | Variação mínima de micro-movimento na janela final | Quadro congelado ou foto estática |
| Qualidade e presença | Exatamente um rosto, tamanho mínimo, centralizado | Terceiros no quadro, rosto distante |
| Câmera virtual | Alerta quando o nome do dispositivo é conhecido (OBS, ManyCam, etc.) | Apenas o caso óbvio |

Lógica pura em `src/logic.js` (testável sem câmera), interface em `src/app.js` e `index.html`.

## Limites que você precisa conhecer

Esta é uma **demonstração**, não um sistema de segurança pronto.

1. **Tudo roda no cliente.** Quem controla o dispositivo pode alterar o JavaScript ou injetar o resultado. Em produção, a decisão tem de ser **no servidor**: o servidor sorteia os desafios e o `nonce`, recebe os quadros (ou vetores) e valida o tempo de resposta.
2. **Vídeo injetado e deepfake em tempo real** vencem desafios simples. A defesa é atestação do dispositivo (Play Integrity, App Attest), SDK nativo com acesso direto à câmera e modelos de anti-spoofing treinados (texturas, moiré, profundidade).
3. **Nome da câmera não prova nada.** A checagem de câmera virtual é só um alerta.
4. **Limiares** (`CONFIG` em `src/logic.js`) precisam ser calibrados com dados reais, incluindo diferentes tons de pele, idades, óculos e iluminação, para equilibrar falso aceite e falso rejeite.
5. **Acessibilidade:** ofereça alternativa para quem não consegue piscar, sorrir ou virar a cabeça.
6. **LGPD:** dado biométrico é sensível (art. 11). Defina base legal e finalidade, minimize a coleta e não guarde quadros sem necessidade.

## Próximos passos sugeridos

- Backend que emite o desafio assinado (nonce com validade curta) e valida a resposta.
- Modelo de anti-spoofing passivo (ex.: classificador de apresentação de ataque) somado aos desafios.
- Métricas de FAR/FRR em um conjunto de teste próprio.
