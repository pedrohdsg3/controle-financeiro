/**
 * CONTROLE DE FATURAS: quanto já paguei de cada fatura, quem já me pagou e o que está vencendo.
 * Os valores vêm do motor (expandMonth), então sempre batem com Resumo e Terceiros.
 * Pagamentos e recebimentos são só controle: não alteram gastos nem o saldo do mês.
 */
import type { Card, CardPayment, Dataset, Receipt } from '../db/types';
import type { Cents } from '../lib/money';
import { addMonths, daysInMonth, monthOf, monthRange, type ISODate, type Month } from '../lib/months';
import { expandMonth, summarizeMonth, type Line } from './engine';

const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0);

export const ALERT_DAYS = 3;

export function dueDateOf(card: Card, month: Month): ISODate | null {
  if (!card.dueDay) return null;
  return `${month}-${String(Math.min(card.dueDay, daysInMonth(month))).padStart(2, '0')}`;
}

/** Dias de `from` até `to` (negativo = já passou). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const utc = (d: ISODate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((utc(to) - utc(from)) / 86400000);
}

export interface PersonBill {
  personId: string;
  owed: Cents;
  received: Cents;
  pending: Cents;
  receipts: Receipt[];
}

export interface Bill {
  cardId: string;
  month: Month;
  total: Cents;
  mine: Cents;
  paid: Cents;
  remaining: Cents;
  dueDate: ISODate | null;
  /** Dias até vencer; negativo = vencida; null = sem vencimento cadastrado. */
  days: number | null;
  payments: CardPayment[];
  people: PersonBill[];
  lines: Line[];
}

function peopleOf(data: Dataset, lines: Line[], month: Month, cardId: string | null): PersonBill[] {
  const receipts = data.receipts.filter((r) => r.month === month && r.cardId === cardId);
  const owed = new Map<string, Cents>();
  for (const l of lines) for (const [p, v] of Object.entries(l.others)) owed.set(p, (owed.get(p) ?? 0) + v);
  receipts.forEach((r) => owed.has(r.personId) || owed.set(r.personId, 0));
  return [...owed.entries()].map(([personId, value]) => {
    const mine = receipts.filter((r) => r.personId === personId);
    const received = sum(mine.map((r) => r.amount));
    return { personId, owed: value, received, pending: Math.max(0, value - received), receipts: mine };
  }).sort((a, b) => b.pending - a.pending);
}

export interface MonthBills {
  bills: Bill[];
  /** Parte de pessoas em gastos fora do cartão (fixos sem cartão, Pix divididos). */
  outside: PersonBill[];
  totals: { total: Cents; paid: Cents; remaining: Cents; owed: Cents; received: Cents; pending: Cents };
}

export function monthBills(data: Dataset, month: Month, today: ISODate): MonthBills {
  const lines = expandMonth(data, month);
  const bills: Bill[] = [...data.cards].sort((a, b) => a.order - b.order).map((card) => {
    const ls = lines.filter((l) => l.cardId === card.id);
    const payments = data.cardPayments.filter((p) => p.cardId === card.id && p.month === month);
    const total = sum(ls.map((l) => l.amount));
    const paid = sum(payments.map((p) => p.amount));
    const dueDate = dueDateOf(card, month);
    return {
      cardId: card.id, month, total, mine: sum(ls.map((l) => l.mine)), paid, remaining: Math.max(0, total - paid),
      dueDate, days: dueDate ? daysBetween(today, dueDate) : null, payments,
      people: peopleOf(data, ls, month, card.id), lines: ls,
    };
  }).filter((b) => b.total > 0 || b.paid > 0 || b.people.length > 0);

  const outside = peopleOf(data, lines.filter((l) => l.cardId === null), month, null);
  const everyone = [...bills.flatMap((b) => b.people), ...outside];
  return {
    bills, outside,
    totals: {
      total: sum(bills.map((b) => b.total)), paid: sum(bills.map((b) => Math.min(b.paid, b.total))),
      remaining: sum(bills.map((b) => b.remaining)), owed: sum(everyone.map((p) => p.owed)),
      received: sum(everyone.map((p) => p.received)), pending: sum(everyone.map((p) => p.pending)),
    },
  };
}

/** Quanto a pessoa já pagou e quanto falta, no mês, somando todos os cartões. */
export function personMonthStatus(data: Dataset, month: Month, today: ISODate, personId: string) {
  const { bills, outside } = monthBills(data, month, today);
  const rows = [...bills.flatMap((b) => b.people), ...outside].filter((p) => p.personId === personId);
  return { received: sum(rows.map((r) => r.received)), pending: sum(rows.map((r) => r.pending)) };
}

/** Desde quando existe controle. Meses anteriores não contam como dívida: não foram registrados. */
export function trackingStart(data: Dataset, today: ISODate): Month {
  const months = [monthOf(today), ...data.cardPayments.map((p) => p.month), ...data.receipts.map((r) => r.month),
    ...data.cards.flatMap((c) => (c.dueFrom ? [c.dueFrom] : []))];
  return months.sort()[0];
}

export interface OpenDebt {
  personId: string;
  pending: Cents;
  months: { month: Month; pending: Cents }[];
}

/** "Quem ainda me deve": do início do controle até o mês atual (parcelas futuras ainda não venceram). */
export function openDebts(data: Dataset, today: ISODate): OpenDebt[] {
  const map = new Map<string, OpenDebt>();
  for (const month of monthRange(trackingStart(data, today), monthOf(today))) {
    const { bills, outside } = monthBills(data, month, today);
    for (const p of [...bills.flatMap((b) => b.people), ...outside]) {
      if (!p.pending) continue;
      const d = map.get(p.personId) ?? { personId: p.personId, pending: 0, months: [] };
      d.pending += p.pending;
      const m = d.months.find((x) => x.month === month);
      if (m) m.pending += p.pending;
      else d.months.push({ month, pending: p.pending });
      map.set(p.personId, d);
    }
  }
  return [...map.values()].sort((a, b) => b.pending - a.pending);
}

export interface OpenBill {
  cardId: string;
  cardName: string;
  month: Month;
  dueDate: ISODate;
  days: number;
  remaining: Cents;
}

/** Faturas com vencimento cadastrado e ainda não quitadas, da mais urgente para a menos. */
export function openBills(data: Dataset, today: ISODate): OpenBill[] {
  const now = monthOf(today);
  const out: OpenBill[] = [];
  for (const card of data.cards) {
    if (!card.dueDay || card.archived) continue;
    const start = card.dueFrom && card.dueFrom > addMonths(now, -6) ? card.dueFrom : addMonths(now, -6);
    for (const month of monthRange(start, addMonths(now, 2))) {
      const bill = monthBills(data, month, today).bills.find((b) => b.cardId === card.id);
      if (!bill?.dueDate || bill.remaining <= 0) continue;
      out.push({ cardId: card.id, cardName: card.name, month, dueDate: bill.dueDate, days: bill.days!, remaining: bill.remaining });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

/** O que merece alerta agora: vencidas ou vencendo em até ALERT_DAYS dias. */
export const dueAlerts = (data: Dataset, today: ISODate) => openBills(data, today).filter((b) => b.days <= ALERT_DAYS);

export function dueLabel(days: number): string {
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  if (days > 1) return `vence em ${days} dias`;
  return days === -1 ? 'venceu ontem' : `venceu há ${-days} dias`;
}

/** Link que cria na agenda do Google um evento mensal no dia do vencimento. */
export function calendarLink(card: Card, today: ISODate): string | null {
  if (!card.dueDay) return null;
  let month = monthOf(today);
  if ((dueDateOf(card, month) as string) < today) month = addMonths(month, 1);
  const start = (dueDateOf(card, month) as string).replaceAll('-', '');
  const next = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(4, 6)) - 1, Number(start.slice(6, 8)) + 1));
  const end = next.toISOString().slice(0, 10).replaceAll('-', '');
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `Vencimento fatura ${card.name}`, dates: `${start}/${end}`,
    recur: `RRULE:FREQ=MONTHLY;BYMONTHDAY=${card.dueDay}`,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export interface CashView {
  inflow: { salary: Cents; otherIncome: Cents; received: Cents; receivedOutside: Cents; total: Cents };
  outflow: { cardsPaid: Cents; nonCard: Cents; pix: Cents; saved: Cents; sent: Cents; total: Cents };
  /** O que já entrou menos o que já saiu no mês. */
  cash: Cents;
  /** Saldo previsto descontando tudo que terceiros ainda não pagaram. */
  ifNoOnePays: Cents;
}

/**
 * Visão de dinheiro real do mês. O saldo previsto (planilha) assume que todos pagam; esta não.
 * Salário e receitas contam como recebidos; fixos fora do cartão, Pix e guardado, como já saídos.
 */
export function cashView(data: Dataset, month: Month, today: ISODate): CashView {
  const s = summarizeMonth(data, month);
  const { bills, totals } = monthBills(data, month, today);
  const settled = (direction: 'paysMe' | 'iOwe', done: boolean) => sum(data.settlements
    .filter((x) => x.month === month && x.direction === direction && !!x.doneAt === done).map((x) => x.amount));
  const inflow = {
    salary: s.salary, otherIncome: s.otherIncome, received: totals.received, receivedOutside: settled('paysMe', true), total: 0,
  };
  inflow.total = inflow.salary + inflow.otherIncome + inflow.received + inflow.receivedOutside;
  const outflow = {
    cardsPaid: sum(bills.map((b) => b.paid)), nonCard: s.cards.find((c) => c.cardId === null)?.total ?? 0,
    pix: s.pixTotal, saved: s.saved, sent: settled('iOwe', true), total: 0,
  };
  outflow.total = outflow.cardsPaid + outflow.nonCard + outflow.pix + outflow.saved + outflow.sent;
  return { inflow, outflow, cash: inflow.total - outflow.total, ifNoOnePays: s.freeBalance - totals.pending - settled('paysMe', false) };
}
