/** Procura lançamentos que parecem errados, para você confirmar ou corrigir. Nada é alterado aqui. */
import { ME, type Dataset, type Installment, type Transaction } from '../db/types';
import { diffMonths, monthOf } from '../lib/months';
import { shares, UNASSIGNED } from './engine';

export const LOW_VALUE = 1000; // R$ 10,00

export interface ReviewIssue {
  /** Identifica o aviso; "Está certo" guarda esta chave para não repetir. */
  key: string;
  reason: string;
  tx?: Transaction;
  installment?: Installment;
}

export function reviewIssues(data: Dataset, dismissed: readonly string[] = []): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const add = (kind: string, reason: string, tx?: Transaction, installment?: Installment) =>
    out.push({ key: `${kind}:${tx?.id ?? installment?.id}`, reason, tx, installment });
  const hasCategory = (id?: string) => data.categories.some((c) => c.id === id);
  const firstCategory = [...data.categories].sort((a, b) => a.order - b.order)[0]?.id;
  const noPerson = (usedBy: string, amount: number, split: Transaction['split']) =>
    !!shares(amount, usedBy, split).others[UNASSIGNED] || (!!split && split.myShare < amount && !split.restPersonId);

  const seen = new Map<string, Transaction>();
  for (const t of data.transactions) {
    if (t.kind === 'income') continue;
    if (t.amount < LOW_VALUE) add('valor', 'Valor muito baixo. Confira se não era um valor maior (ex: 1.500 lido como 1,50).', t);
    if (!hasCategory(t.categoryId)) add('categoria', 'Sem categoria válida.', t);
    else if (t.description === 'Gasto' && t.categoryId === firstCategory) add('categoria', 'Foi salvo sem categoria e entrou na primeira da lista. Confira.', t);
    if (noPerson(t.usedBy, t.amount, t.split)) add('pessoa', 'Dividido, mas sem dizer quem paga o resto.', t);
    if (t.kind === 'card') {
      const gap = diffMonths(t.month, monthOf(t.date));
      if (gap < 0) add('data', 'A data da compra é depois da fatura. Uma das duas parece errada.', t);
      else if (gap > 2) add('data', 'A fatura está muito distante da data da compra.', t);
    }
    const dup = `${t.kind}|${t.date}|${t.amount}|${t.cardId ?? ''}|${t.description.trim().toLowerCase()}`;
    if (seen.has(dup)) add('duplicado', 'Parece repetido: mesma data, valor e descrição de outro lançamento.', t);
    else seen.set(dup, t);
  }
  for (const i of data.installments) {
    if (i.total < LOW_VALUE) add('valor', 'Total do parcelamento muito baixo. Confira.', undefined, i);
    if (noPerson(i.usedBy ?? ME, i.total, i.split)) add('pessoa', 'Dividido, mas sem dizer quem paga o resto.', undefined, i);
  }
  return out.filter((x) => !dismissed.includes(x.key));
}
