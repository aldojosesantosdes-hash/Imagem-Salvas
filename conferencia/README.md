# Conferência Digital de Presença

Aplicação web (estática, funciona offline depois de aberta) que lê a **escala do SISGESPOL em PDF**, permite conferir presença por policial e gera o **PDF de conferência** no padrão do modelo "Conferência Digital de Presença" (formulário preenchível).

## Experiência

- **Atalhos de equipe**: a escala é agrupada automaticamente por setor e turno (`Setor 1 · 12h–18h`) e por blocos repetidos (`Escolta de Urnas · 14h–20h`); um toque seleciona a equipe.
- **Conferência**: anel de progresso, filtros Todos / A conferir / Faltas, busca por nome ou matrícula, observação recolhível com atalhos (Atraso, Substituição, Dispensado), vibração ao marcar e **Desfazer** após "Todos".
- **Instalável e offline** (PWA): "Adicionar à tela inicial" abre como aplicativo; depois do primeiro acesso funciona sem internet (`sw.js`).
- Tipografia Inter embutida (`fonts/`, licença OFL), modo escuro automático e ícones próprios.

## PDFs aceitos

| Tipo | Como é reconhecido |
|---|---|
| Escala SISGESPOL (eventos, eleições, ordinária) | Blocos `FUNÇÃO - DATA: dd/mm/aaaa, DE 00h00 ÀS 00h00` + tabela Nome / Matrícula / Função. Títulos longos quebrados em várias linhas são reunidos |
| Conferência por posto (modelo do Olodum) | Barra com o título da equipe e a data na linha de baixo. Marcações lidas dos campos `<posto>_presenca_<matrícula>` |
| Conferência por setor (modelo da eleição) | Grupo `SETOR n` + `TURNO dd/mm/aaaa · 07h00 ÀS 13h00` e equipes sem data própria. Marcações lidas dos campos `p<seção>_<linha>` / `o<seção>_<linha>` |

## Uso

1. Abra `conferencia/index.html` por um servidor (`npm start` na raiz e acesse `http://localhost:8080/conferencia/`).
2. Carregue a escala em PDF.
3. Em **Seções a conferir**, digite o termo do posto (ex.: `ALFREDO DE BRITO`) e toque em **Selecionar**. Subtítulo e responsável são sugeridos automaticamente e podem ser editados.
4. Para cada policial: **P** (presente) ou **F** (falta); tocar de novo desmarca. Use a observação para atraso, substituição ou dispensa.
5. **Gerar PDF** (conferência preenchível) e/ou **Release** (texto no padrão de WhatsApp).

## Release (extrato da operação)

Texto pronto para o WhatsApp, montado com as seções selecionadas e o resultado da conferência:

```
*POLÍCIA MILITAR DA BAHIA*
*COPPM / CPRC-BTS*
*18° BPM*

*Operação Eleição*

*Extrato da Operação Eleição/2026*

*Data*: 04/10/2026  (domingo)
*Horário:* 12h às 18h

Coordenador: Ten PM *Marco Antonio*
Motorista: SD PM *Jorge*
Vtr: 8.2815

*1 - Bahia Brits Club (Clube Inglês)*
SD PM *Bispo*
SD PM *Teixeira*

*RESUMO:*
Efetivo previsto: 18
Efetivo ativo: 18
Faltas: 00
Atrasos: 00

*PMBA, uma Força a serviço do cidadão!*
```

- **Nome de guerra**: lido de `nomes-guerra.json` (opcional, não versionado: `{ "sal": "...", "nomes": { "<sha256(sal+matrícula) 16 hex>": "NOME" } }`). Quem não estiver na base aparece numa lista dentro da janela do release para ser informado; o que for digitado fica salvo no aparelho.
- **Coordenação**: seções de coordenação/comando/supervisão viram `Função: Posto *Nome*` (Comandante e Coordenador saem como "Coordenador"). As demais viram postos numerados.
- **Conferência**: falta sem substituto sai com "(falta)"; "Substituído por FULANO" coloca o substituto; o resumo conta faltas, atrasos (observação com "atraso") e não conferidos.
- **Vtr**: campo opcional na janela do release.
- Manhã e tarde (ou setores diferentes) selecionados juntos viram blocos com cabeçalho próprio.

## O PDF gerado

| Item | Detalhe |
|---|---|
| Cabeçalho | Brasão, comando/unidade, operação, posto, data, serviço, efetivo e responsável |
| Tabelas | Uma por seção da escala: Nome, Matrícula, Função, Presente (checkbox) e Observação (campo de texto) |
| Campos | `<posto>_presenca_<matrícula>` e `<posto>_presenca_<matrícula>_obs`, editáveis em qualquer leitor de PDF |
| Faltas | Checkbox desmarcado e observação iniciada por `FALTA` |
| Resumo | Efetivo previsto, presentes, faltas, não conferidos e linha de assinatura |
| Rodapé | Paginação e linha de cópia controlada com o nome de quem conferiu |

## Limites

- O PDF precisa ter **texto selecionável**. Escala escaneada ou fotografada não é lida (exigiria OCR).
- Layouts fora dos três da tabela acima precisam de ajuste em `parser.js`.
- O registro é declaratório: o PDF não tem assinatura digital e o formulário continua editável.

Bibliotecas incluídas em `vendor/`: pdf.js 3.11.174 (leitura) e pdf-lib 1.17.1 (geração), ambas com licença própria no diretório.
