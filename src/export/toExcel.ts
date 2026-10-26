/** Exporta tudo para uma planilha .xlsx (só valores, para conferência ou arquivo). */
import * as XLSX from 'xlsx';
import { ME, type Dataset } from '../db/types';
import { dataMonthRange, history, installmentLastMonth, shares, summarizeMonth, txLine } from '../engine/engine';
import { currentMonth, monthLabel, monthRange } from '../lib/months';

const r = (c: number) => Math.round(c) / 100;

export function exportExcel(data: Dataset): Uint8Array {
  const card = (id?: string) => data.cards.find((c) => c.id === id)?.name ?? '';
  const cat = (id?: string) => data.categories.find((c) => c.id === id)?.name ?? '';
  const person = (id?: string) => (!id ? '' : id === ME ? 'Eu' : data.people.find((p) => p.id === id)?.name ?? '?');
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);

  const tx = [...data.transactions].sort((a, b) => (a.date < b.date ? -1 : 1));
  add('Lançamentos', tx.map((t) => {
    const l = t.kind === 'income' ? null : txLine(t);
    return {
      Tipo: t.kind === 'card' ? 'Cartão' : t.kind === 'pix' ? 'Pix' : 'Receita', Data: t.date, Mês: monthLabel(t.month),
      Cartão: card(t.cardId), Descrição: t.description, Categoria: cat(t.categoryId), 'Quem usou': person(t.usedBy),
      'Valor (R$)': r(t.amount), 'Meu (R$)': l ? r(l.mine) : r(t.amount),
      'Minha parte (R$)': t.split ? r(t.split.myShare) : '', 'Quem paga o resto': t.split ? person(t.split.restPersonId) : '',
    };
  }));
  add('Parcelamentos', data.installments.map((i) => ({
    Descrição: i.description, Cartão: card(i.cardId), Categoria: cat(i.categoryId), 'Quem usou': person(i.usedBy),
    'Valor total (R$)': r(i.total), Parcelas: i.count, 'Valor parcela (R$)': r(i.total / i.count),
    'Primeira fatura': monthLabel(i.startMonth), 'Última fatura': monthLabel(installmentLastMonth(i)),
    'Minha parte total (R$)': i.split ? r(i.split.myShare) : '', 'Quem paga o resto': i.split ? person(i.split.restPersonId) : '',
  })));
  add('Fixos', data.recurring.map((f) => ({
    Descrição: f.description, Tipo: f.type, 'Forma pgto': f.payMethod, Cartão: card(f.cardId), Categoria: cat(f.categoryId),
    'Valor (R$)': r(f.amount), 'Dia venc.': f.dueDay, 'Começa': monthLabel(f.startMonth), 'Último mês': f.endMonth ? monthLabel(f.endMonth) : '',
    'Meses que não paga': f.skipMonths.map(monthLabel).join(', '), 'Minha parte (R$)': r(shares(f.amount, ME, f.split).mine),
    'Quem paga o resto': f.split ? person(f.split.restPersonId) : '',
  })));

  const range = dataMonthRange(data, currentMonth());
  add('Histórico', history(data, range.from, range.to).map((h) => ({
    Mês: monthLabel(h.month), 'Renda (R$)': r(h.income), 'Total faturas (R$)': r(h.totalBills), 'A receber terceiros (R$)': r(h.toReceive),
    'Meu gasto (R$)': r(h.totalMine), 'Pix (R$)': r(h.pixMine), 'Enviei a terceiros (R$)': r(h.sentToOthers),
    'Guardado (R$)': r(h.saved), 'Saldo livre (R$)': r(h.freeBalance), 'Reserva acumulada (R$)': r(h.reserve),
  })));
  add('Terceiros', monthRange(range.from, range.to).flatMap((m) =>
    summarizeMonth(data, m).people.filter((p) => p.subtotal || p.paysMe || p.iOwe).map((p) => ({
      Mês: monthLabel(m), Pessoa: person(p.personId), 'Gastos nos cartões (R$)': r(p.subtotal - p.recurring - p.pix),
      'Fixos divididos (R$)': r(p.recurring), 'Pix (R$)': r(p.pix), 'Por fora (R$)': r(p.paysMe), 'Eu devo enviar (R$)': r(p.iOwe),
      'Saldo líquido (R$)': r(p.net),
    }))));
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
