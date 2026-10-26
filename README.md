# Controle Financeiro (PWA)

App pessoal de controle de gastos: cartões, parcelamentos, fixos, Pix, terceiros e metas.
Funciona offline e guarda tudo **só no aparelho** (IndexedDB). Sem conta, sem servidor.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o app no computador em http://localhost:5173 |
| `npm run dev:celular` | Igual, mas acessível pelo celular na mesma rede Wi-Fi (só para testar a tela; instalar como app exige HTTPS) |
| `npm test` | Confere o motor de cálculo contra a planilha antiga (`dados/planilha.xlsx`) |
| `npm run backup-inicial` | Gera `dados/backup-inicial.json` a partir da planilha + `dados/ajustes.json` |
| `npm run build` | Gera a versão final em `dist/` |

## Onde fica cada coisa

- `src/engine/engine.ts` — **motor de cálculo**: todas as regras (fatura × meu gasto, divisões, parcelas, fixos, saldo).
- `src/import/fromSpreadsheet.ts` — lê os dados da planilha antiga (só valores, nenhuma fórmula).
- `src/db/` — modelo de dados e banco local.
- `src/ui/` — telas.
- `dados/` — **seus dados pessoais**. Fica fora do Git e nunca é servido pelo app.

## Regras principais

- Valores em centavos (inteiros). Parcelas: o centavo que sobra vai na 1ª parcela.
- Fatura recebe o valor cheio; "meu gasto" desconta a parte de terceiros.
- Saldo livre = renda − meu gasto − guardado − Pix (minha parte) − enviei a terceiros.
- Mês da fatura sugerido pelo dia de fechamento do cartão: compras a partir do dia de fechamento vão para o mês seguinte (sempre dá para trocar no lançamento).
