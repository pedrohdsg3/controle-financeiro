/**
 * MOTOR DE CÁLCULO
 *
 * Toda tela do app (calendário, resumo, terceiros, histórico) usa estas funções.
 * A ideia: para um mês, "expandimos" tudo o que existe (compras no cartão, parcelas,
 * fixos, Pix) em LINHAS padronizadas. Cada linha sabe o valor cheio, quanto é meu e
 * quanto é de cada pessoa. Os totais são só somas dessas linhas — por isso os números
 * batem entre todas as telas.
 */
import { splitInstallments, type Cents } from '../lib/money';
import { addMonths, diffMonths, monthOf, monthRange, type ISODate, type Month } from '../lib/months';
import {
  ME, type Card, type Dataset, type Installment, type Recurring, type Split, type Transaction,
} from '../db/types';

export type LineSource = 'card' | 'installment' | 'recurring' | 'pix';

export interface Line {
  month: Month;
  source: LineSource;
  refId: string;
  date?: ISODate;
  /** null = fora do cartão (boleto, Pix, débito) */
  cardId: string | null;
  categoryId?: string;
  description: string;
  /** Valor cheio (o que sai do cartão/conta). */
  amount: Cents;
  /** Quanto disso é gasto MEU. */
  mine: Cents;
  /** Quanto é de cada pessoa (personId → valor). Soma de mine + others = amount. */
  others: Record<string, Cents>;
  /** Ex: "Parcela 3/10" */
  detail?: string;
}

/** Parte de terceiros sem pessoa definida (dado inconsistente). */
export const UNASSIGNED = '?';

/** Regra única de divisão, usada por TODO tipo de gasto. */
export function shares(amount: Cents, usedBy: string, split?: Split): { mine: Cents; others: Record<string, Cents> } {
  const mine = split ? split.myShare : usedBy === ME ? amount : 0;
  const rest = amount - mine;
  const others: Record<string, Cents> = {};
  if (rest !== 0) {
    const who = split?.restPersonId || (usedBy !== ME ? usedBy : UNASSIGNED);
    others[who] = rest;
  }
  return { mine, others };
}

export function recurringActiveIn(r: Recurring, m: Month): boolean {
  if (m < r.startMonth) return false;
  if (r.endMonth && m > r.endMonth) return false;
  return !r.skipMonths.includes(m);
}

/** Qual parcela (1..N) cai no mês m, ou null se nenhuma. */
export function installmentNumberIn(inst: Installment, m: Month): number | null {
  const n = diffMonths(m, inst.startMonth) + 1;
  return n >= 1 && n <= inst.count ? n : null;
}

export function installmentLastMonth(inst: Installment): Month {
  return addMonths(inst.startMonth, inst.count - 1);
}

function installmentLine(inst: Installment, n: number, m: Month): Line {
  const amounts = splitInstallments(inst.total, inst.count);
  const amount = amounts[n - 1];
  let mine: Cents;
  let others: Record<string, Cents>;
  if (inst.split) {
    const myParts = splitInstallments(inst.split.myShare, inst.count);
    ({ mine, others } = shares(amount, inst.usedBy, { ...inst.split, myShare: myParts[n - 1] }));
  } else {
    ({ mine, others } = shares(amount, inst.usedBy));
  }
  return {
    month: m, source: 'installment', refId: inst.id, cardId: inst.cardId, categoryId: inst.categoryId,
    description: inst.description, amount, mine, others, detail: `Parcela ${n}/${inst.count}`,
    date: inst.purchaseDate,
  };
}

function recurringLine(r: Recurring, m: Month): Line {
  const { mine, others } = shares(r.amount, ME, r.split);
  return {
    month: m, source: 'recurring', refId: r.id, cardId: r.cardId ?? null, categoryId: r.categoryId,
    description: r.description, amount: r.amount, mine, others, detail: `${r.type} · vence dia ${r.dueDay}`,
  };
}

export function txLine(t: Transaction): Line {
  const { mine, others } = shares(t.amount, t.usedBy, t.split);
  return {
    month: t.month, source: t.kind === 'card' ? 'card' : 'pix', refId: t.id, date: t.date,
    cardId: t.kind === 'card' ? t.cardId ?? null : null, categoryId: t.categoryId,
    description: t.description, amount: t.amount, mine, others,
  };
}

/** Todas as linhas de GASTO de um mês. */
export function expandMonth(data: Dataset, m: Month): Line[] {
  const lines: Line[] = [];
  for (const t of data.transactions) {
    if (t.month === m && t.kind !== 'income') lines.push(txLine(t));
  }
  for (const inst of data.installments) {
    const n = installmentNumberIn(inst, m);
    if (n) lines.push(installmentLine(inst, n, m));
  }
  for (const r of data.recurring) {
    if (recurringActiveIn(r, m)) lines.push(recurringLine(r, m));
  }
  return lines;
}

export function salaryFor(data: Dataset, m: Month): Cents {
  const changes = data.salaries.filter((s) => s.fromMonth <= m).sort((a, b) => (a.fromMonth < b.fromMonth ? -1 : 1));
  return changes.length ? changes[changes.length - 1].amount : 0;
}

const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0);

export interface CardTotals {
  cardId: string | null; // null = Fixos/Boletos (não-cartão)
  total: Cents;
  mine: Cents;
  others: Cents;
  lines: Line[];
}

export interface PersonTotals {
  personId: string;
  byCard: Record<string, Cents>; // cardId (ou 'none') → valor de compras/parcelas
  recurring: Cents; // parte dela em fixos/assinaturas divididas
  pix: Cents; // parte dela em gastos no Pix
  subtotal: Cents; // tudo o que veio dos gastos
  paysMe: Cents; // "vai me passar por fora"
  iOwe: Cents; // "eu devo enviar"
  net: Cents; // saldo líquido: subtotal + paysMe − iOwe (positivo = ela me deve)
}

export interface MonthSummary {
  month: Month;
  salary: Cents;
  otherIncome: Cents;
  incomeFromOthers: Cents; // recebido de terceiros por fora
  totalIncome: Cents;
  cards: CardTotals[]; // um por cartão + não-cartão (só os que têm valor ou estão ativos)
  totalBills: Cents; // TOTAL GASTOS (FATURAS)
  toReceive: Cents; // (−) a receber de terceiros
  totalMine: Cents; // TOTAL GASTOS (MEU)
  saved: Cents;
  pixTotal: Cents;
  pixMine: Cents;
  sentToOthers: Cents;
  freeBalance: Cents; // SALDO DO MÊS (livre)
  byCategory: { categoryId: string; mine: Cents }[];
  people: PersonTotals[];
  lines: Line[];
}

export function summarizeMonth(data: Dataset, m: Month): MonthSummary {
  const lines = expandMonth(data, m);
  const billLines = lines.filter((l) => l.source !== 'pix');
  const pixLines = lines.filter((l) => l.source === 'pix');

  const salary = salaryFor(data, m);
  const otherIncome = sum(data.transactions.filter((t) => t.kind === 'income' && t.month === m).map((t) => t.amount));
  const settlements = data.settlements.filter((s) => s.month === m);
  const incomeFromOthers = sum(settlements.filter((s) => s.direction === 'paysMe').map((s) => s.amount));
  const sentToOthers = sum(settlements.filter((s) => s.direction === 'iOwe').map((s) => s.amount));

  const activeCards = [...data.cards].sort((a, b) => a.order - b.order);
  const cardIds: (string | null)[] = [...activeCards.map((c) => c.id), null];
  const cards: CardTotals[] = cardIds
    .map((cardId) => {
      const ls = billLines.filter((l) => l.cardId === cardId);
      const total = sum(ls.map((l) => l.amount));
      const mine = sum(ls.map((l) => l.mine));
      return { cardId, total, mine, others: total - mine, lines: ls };
    })
    .filter((c) => c.lines.length > 0);

  const totalBills = sum(cards.map((c) => c.total));
  const totalMine = sum(cards.map((c) => c.mine));
  const pixTotal = sum(pixLines.map((l) => l.amount));
  const pixMine = sum(pixLines.map((l) => l.mine));
  const saved = data.savings.find((s) => s.month === m)?.amount ?? 0;
  const totalIncome = salary + otherIncome + incomeFromOthers;

  const catMap = new Map<string, Cents>();
  for (const l of lines) {
    if (!l.mine) continue;
    const k = l.categoryId ?? 'sem-categoria';
    catMap.set(k, (catMap.get(k) ?? 0) + l.mine);
  }
  const byCategory = [...catMap.entries()]
    .map(([categoryId, mine]) => ({ categoryId, mine }))
    .sort((a, b) => b.mine - a.mine);

  return {
    month: m, salary, otherIncome, incomeFromOthers, totalIncome, cards, totalBills,
    toReceive: totalBills - totalMine, totalMine, saved, pixTotal, pixMine, sentToOthers,
    freeBalance: totalIncome - totalMine - saved - pixMine - sentToOthers,
    byCategory, people: peopleTotals(data, lines, settlements), lines,
  };
}

function peopleTotals(data: Dataset, lines: Line[], settlements: Dataset['settlements']): PersonTotals[] {
  const ids = new Set<string>(data.people.map((p) => p.id));
  for (const l of lines) Object.keys(l.others).forEach((k) => ids.add(k));
  settlements.forEach((s) => ids.add(s.personId));

  return [...ids].map((personId) => {
    const byCard: Record<string, Cents> = {};
    let recurring = 0;
    let pix = 0;
    for (const l of lines) {
      const v = l.others[personId];
      if (!v) continue;
      if (l.source === 'recurring') recurring += v;
      else if (l.source === 'pix') pix += v;
      else byCard[l.cardId ?? 'none'] = (byCard[l.cardId ?? 'none'] ?? 0) + v;
    }
    const subtotal = sum(Object.values(byCard)) + recurring + pix;
    const mine = settlements.filter((s) => s.personId === personId);
    const paysMe = sum(mine.filter((s) => s.direction === 'paysMe').map((s) => s.amount));
    const iOwe = sum(mine.filter((s) => s.direction === 'iOwe').map((s) => s.amount));
    return { personId, byCard, recurring, pix, subtotal, paysMe, iOwe, net: subtotal + paysMe - iOwe };
  });
}

/** Primeiro e último mês com algum dado (para histórico e seletores). */
export function dataMonthRange(data: Dataset, fallback: Month): { from: Month; to: Month } {
  const months: Month[] = [fallback];
  data.transactions.forEach((t) => months.push(t.month));
  data.installments.forEach((i) => months.push(i.startMonth, installmentLastMonth(i)));
  data.recurring.forEach((r) => months.push(r.startMonth));
  data.salaries.forEach((s) => months.push(s.fromMonth));
  months.sort();
  return { from: months[0], to: months[months.length - 1] };
}

export interface HistoryRow {
  month: Month;
  income: Cents;
  totalBills: Cents;
  toReceive: Cents;
  totalMine: Cents;
  pixMine: Cents;
  sentToOthers: Cents;
  freeBalance: Cents;
  saved: Cents;
  reserve: Cents; // guardado acumulado até o mês
}

export function history(data: Dataset, from: Month, to: Month): HistoryRow[] {
  let reserve = 0;
  return monthRange(from, to).map((m) => {
    const s = summarizeMonth(data, m);
    reserve += s.saved;
    return {
      month: m, income: s.totalIncome, totalBills: s.totalBills, toReceive: s.toReceive,
      totalMine: s.totalMine, pixMine: s.pixMine, sentToOthers: s.sentToOthers,
      freeBalance: s.freeBalance, saved: s.saved, reserve,
    };
  });
}

/** Reserva acumulada até o mês m (inclusive). */
export function reserveUntil(data: Dataset, m: Month): Cents {
  return sum(data.savings.filter((s) => s.month <= m).map((s) => s.amount));
}

/**
 * Sugere o mês da fatura de uma compra no cartão:
 * compras ANTES do dia de fechamento caem na fatura do próprio mês;
 * a partir do dia de fechamento, na fatura do mês seguinte.
 */
export function suggestBillMonth(card: Card | undefined, date: ISODate): Month {
  const m = monthOf(date);
  if (!card?.closingDay) return m;
  const day = Number(date.slice(8, 10));
  return day >= card.closingDay ? addMonths(m, 1) : m;
}

/** Totais por dia (para o calendário), pela data da compra. */
export function dayTotals(data: Dataset, from: ISODate, to: ISODate) {
  const map = new Map<ISODate, { spentMine: Cents; spentTotal: Cents; income: Cents; cats: Set<string> }>();
  for (const t of data.transactions) {
    if (t.date < from || t.date > to) continue;
    const e = map.get(t.date) ?? { spentMine: 0, spentTotal: 0, income: 0, cats: new Set<string>() };
    if (t.kind === 'income') e.income += t.amount;
    else {
      const l = txLine(t);
      e.spentMine += l.mine;
      e.spentTotal += l.amount;
      if (t.categoryId) e.cats.add(t.categoryId);
    }
    map.set(t.date, e);
  }
  return map;
}
