# Conferência Digital de Presença

Aplicação web (estática, funciona offline depois de aberta) que lê a **escala do SISGESPOL em PDF**, permite conferir presença por policial e gera o **PDF de conferência** no padrão do modelo "Conferência Digital de Presença" (formulário preenchível).

## Uso

1. Abra `conferencia/index.html` por um servidor (`npm start` na raiz e acesse `http://localhost:8080/conferencia/`).
2. Carregue a escala em PDF.
3. Em **Seções a conferir**, digite o termo do posto (ex.: `ALFREDO DE BRITO`) e toque em **Selecionar**. Subtítulo e responsável são sugeridos automaticamente e podem ser editados.
4. Para cada policial: **P** (presente) ou **F** (falta); tocar de novo desmarca. Use a observação para atraso, substituição ou dispensa.
5. **Gerar PDF da conferência**.

As marcações ficam salvas no navegador. Carregar um PDF de conferência já gerado recupera as marcações dele.

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
- A leitura reconhece blocos `FUNÇÃO - DATA: dd/mm/aaaa, DE 00h00 ÀS 00h00` seguidos da tabela `Nome / Matrícula / Função`. Outro layout de escala precisa de ajuste em `parser.js`.
- O registro é declaratório: o PDF não tem assinatura digital e o formulário continua editável.

Bibliotecas incluídas em `vendor/`: pdf.js 3.11.174 (leitura) e pdf-lib 1.17.1 (geração), ambas com licença própria no diretório.
