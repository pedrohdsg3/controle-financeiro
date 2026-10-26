import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { emptyDataset, ME, type Dataset } from '../db/types';
import { exportExcel } from '../export/toExcel';
import { history, summarizeMonth } from './engine';

const base = (): Dataset => ({
  ...emptyDataset(),
  cards: [{ id: 'c1', name: 'Cartão', color: '#000', order: 0 }],
  people: [{ id: 'p1', name: 'Fulana', order: 0 }],
  salaries: [{ id: 's', fromMonth: '2026-01', amount: 300000 }],
});

describe('regras de fixos, parcelas, terceiros e saldo', () => {
  it('fixo respeita início, último mês e meses pulados', () => {
    const d = base();
    d.recurring.push({ id: 'r', description: 'Academia', type: 'Assinatura', payMethod: 'Cartão', cardId: 'c1', categoryId: 'x',
      amount: 9000, dueDay: 8, startMonth: '2026-02', endMonth: '2026-05', skipMonths: ['2026-03'], createdAt: 0 });
    const total = (m: string) => summarizeMonth(d, m).totalBills;
    expect([total('2026-01'), total('2026-02'), total('2026-03'), total('2026-05'), total('2026-06')]).toEqual([0, 9000, 0, 9000, 0]);
  });

  it('parcelamento dividido: minha parte proporcional e soma exata', () => {
    const d = base();
    d.installments.push({ id: 'i', description: 'TV', cardId: 'c1', categoryId: 'x', usedBy: ME, total: 100000, count: 3,
      startMonth: '2026-11', split: { myShare: 50000, restPersonId: 'p1' }, createdAt: 0 });
    const ms = ['2026-11', '2026-12', '2027-01'].map((m) => summarizeMonth(d, m));
    expect(ms.reduce((a, s) => a + s.totalBills, 0)).toBe(100000);
    expect(ms.reduce((a, s) => a + s.totalMine, 0)).toBe(50000);
    expect(ms.reduce((a, s) => a + (s.people.find((p) => p.personId === 'p1')?.subtotal ?? 0), 0)).toBe(50000);
    expect(summarizeMonth(d, '2027-02').totalBills).toBe(0);
  });

  it('saldo livre = renda − meu − guardado − pix − enviei; reserva acumula', () => {
    const d = base();
    d.transactions.push(
      { id: 't1', kind: 'card', date: '2026-01-05', month: '2026-01', cardId: 'c1', description: 'x', amount: 10000, usedBy: ME, createdAt: 0 },
      { id: 't2', kind: 'card', date: '2026-01-05', month: '2026-01', cardId: 'c1', description: 'y', amount: 4000, usedBy: 'p1', createdAt: 0 },
      { id: 't3', kind: 'pix', date: '2026-01-06', month: '2026-01', description: 'z', amount: 2000, usedBy: ME, createdAt: 0 },
      { id: 't4', kind: 'income', date: '2026-01-07', month: '2026-01', description: 'bônus', amount: 50000, usedBy: ME, createdAt: 0 },
    );
    d.settlements.push(
      { id: 'a', month: '2026-01', personId: 'p1', direction: 'paysMe', amount: 1000, createdAt: 0 },
      { id: 'b', month: '2026-01', personId: 'p1', direction: 'iOwe', amount: 3000, createdAt: 0 },
    );
    d.savings.push({ month: '2026-01', amount: 20000 }, { month: '2026-02', amount: 5000 });
    const s = summarizeMonth(d, '2026-01');
    expect(s.totalIncome).toBe(300000 + 50000 + 1000);
    expect(s.totalBills).toBe(14000);
    expect(s.totalMine).toBe(10000);
    expect(s.freeBalance).toBe(351000 - 10000 - 20000 - 2000 - 3000);
    expect(s.people.find((p) => p.personId === 'p1')?.net).toBe(4000 + 1000 - 3000);
    expect(history(d, '2026-01', '2026-02').map((h) => h.reserve)).toEqual([20000, 25000]);
  });

  it('exporta para Excel com as abas esperadas', () => {
    const wb = XLSX.read(exportExcel(base()), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Lançamentos', 'Parcelamentos', 'Fixos', 'Histórico', 'Terceiros']);
  });
});
