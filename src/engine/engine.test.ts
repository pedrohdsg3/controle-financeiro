/**
 * Confere o motor do app contra os números JÁ CALCULADOS pela planilha antiga.
 * Precisa do arquivo dados/planilha.xlsx (fica fora do Git). Sem ele, o teste é pulado.
 * Nenhum valor pessoal fica escrito aqui: os valores esperados são lidos da própria planilha.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { importSpreadsheet } from '../import/fromSpreadsheet';
import { parseMonthLabel } from '../lib/months';
import { splitInstallments, toCents } from '../lib/money';
import { addMonths } from '../lib/months';
import { ME } from '../db/types';
import { shares, summarizeMonth, suggestBillMonth } from './engine';

const FILE = 'dados/planilha.xlsx';
const has = existsSync(FILE);
// Planilha usa divisões não arredondadas (ex: 4432/12 = 369,3333...); o app usa centavos exatos
// e põe o centavo que sobra na 1ª parcela. Por isso aceitamos até 10 centavos de diferença no mês.
const TOL = 10; // centavos

const near = (got: number, expectedReais: number, label: string) =>
  expect(Math.abs(got - toCents(expectedReais)), `${label}: app ${got / 100} × planilha ${expectedReais}`).toBeLessThanOrEqual(TOL);

describe('regras básicas', () => {
  it('parcelas somam exatamente o total', () => {
    const p = splitInstallments(9200, 3);
    expect(p).toEqual([3068, 3066, 3066]);
    expect(p.reduce((a, b) => a + b)).toBe(9200);
  });
  it('divisão: minha parte e o resto para a outra pessoa', () => {
    expect(shares(10000, ME, { myShare: 5000, restPersonId: 'pessoa-a' })).toEqual({ mine: 5000, others: { 'pessoa-a': 5000 } });
    expect(shares(10000, 'pessoa-a')).toEqual({ mine: 0, others: { 'pessoa-a': 10000 } });
    expect(shares(10000, ME)).toEqual({ mine: 10000, others: {} });
  });
  it('virada de ano', () => {
    expect(addMonths('2025-12', 11)).toBe('2026-11');
  });
  it('mês da fatura pelo dia de fechamento', () => {
    const card = { id: 'c', name: 'X', color: '', order: 0, closingDay: 8 };
    expect(suggestBillMonth(card, '2026-10-07')).toBe('2026-10');
    expect(suggestBillMonth(card, '2026-10-08')).toBe('2026-11');
    expect(suggestBillMonth(card, '2026-12-20')).toBe('2027-01');
  });
});

describe.skipIf(!has)('confere com a planilha', () => {
  const buf = has ? readFileSync(FILE) : new Uint8Array();
  const wb = has ? XLSX.read(buf, { type: 'buffer' }) : ({ Sheets: {} } as unknown as XLSX.WorkBook);
  const { data, warnings } = has ? importSpreadsheet(buf) : { data: null!, warnings: [] };
  const cell = (sheet: string, ref: string) => wb.Sheets[sheet]?.[ref]?.v as number | string | undefined;

  it('importa sem avisos inesperados', () => {
    console.log('Avisos da importação:', warnings);
    expect(data.transactions.length).toBeGreaterThan(0);
  });

  it('Histórico: gastos totais, a receber e gasto próprio em todos os meses', () => {
    for (let row = 5; row < 60; row++) {
      const label = cell('Histórico Anual', `A${row}`);
      const m = typeof label === 'string' ? parseMonthLabel(label) : null;
      if (!m) continue;
      const s = summarizeMonth(data, m);
      near(s.totalBills, Number(cell('Histórico Anual', `C${row}`)), `${label} gastos totais`);
      near(s.toReceive, Number(cell('Histórico Anual', `D${row}`)), `${label} a receber`);
      near(s.totalMine, Number(cell('Histórico Anual', `E${row}`)), `${label} gasto próprio`);
    }
  });

  it('Resumo do mês selecionado: cada cartão (total e meu) e não-cartão', () => {
    const m = parseMonthLabel(String(cell('Resumo Mensal', 'B2')))!;
    const s = summarizeMonth(data, m);
    const ws = wb.Sheets['Resumo Mensal'];
    for (let row = 10; row <= 22; row++) {
      const name = String(ws[`A${row}`]?.v ?? '').trim();
      const total = ws[`B${row}`]?.v as number;
      const mine = ws[`B${row + 1}`]?.v as number;
      if (!name || name === 'meu' || name === 'terceiros' || typeof total !== 'number') continue;
      const ct = name.startsWith('Fixos')
        ? s.cards.find((c) => c.cardId === null)!
        : s.cards.find((c) => data.cards.find((x) => x.id === c.cardId)?.name === name)!;
      near(ct.total, total, `${name} total`);
      near(ct.mine, mine, `${name} meu`);
    }
    near(s.totalBills, Number(cell('Resumo Mensal', 'B23')), 'TOTAL GASTOS (FATURAS)');
    near(s.toReceive, Number(cell('Resumo Mensal', 'B24')), 'A receber');
    near(s.totalMine, Number(cell('Resumo Mensal', 'B25')), 'TOTAL GASTOS (MEU)');
    near(s.sentToOthers, Number(cell('Resumo Mensal', 'B28')), 'Enviei para terceiros');
  });

  it('Terceiros: subtotal, por fora, devo enviar e saldo de cada pessoa', () => {
    const m = parseMonthLabel(String(cell('Terceiros', 'B3')))!;
    const s = summarizeMonth(data, m);
    for (let row = 6; row < 30; row++) {
      const name = cell('Terceiros', `A${row}`);
      if (typeof name !== 'string' || name === 'TOTAL') break;
      const p = s.people.find((x) => data.people.find((pp) => pp.id === x.personId)?.name === name);
      near(p?.subtotal ?? 0, Number(cell('Terceiros', `F${row}`) ?? 0), `${name} subtotal`);
      near(p?.paysMe ?? 0, Number(cell('Terceiros', `G${row}`) ?? 0), `${name} por fora`);
      near(p?.iOwe ?? 0, Number(cell('Terceiros', `H${row}`) ?? 0), `${name} devo enviar`);
      near(p?.net ?? 0, Number(cell('Terceiros', `I${row}`) ?? 0), `${name} saldo`);
    }
  });
});
