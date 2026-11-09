import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBackup } from '../backup';
import { emptyDataset, ME, type Dataset } from '../db/types';
import { summarizeMonth } from '../engine/engine';
import { applyPlan, parseLines, planPaste, shareOnCard } from './pasteList';

let seq = 0;
const id = () => `n${seq++}`;

describe('leitura da lista', () => {
  it('entende os formatos comuns', () => {
    const { lines, header, unreadable } = parseLines(`Fulana:

Mercado - 516,07 2/2
Loja 31
Loja.com Online - 266,68 1/3
Posto: R$ 1.250,50
• Café 51,2
Mercado 12.50
linha sem valor
`);
    expect(header).toBe('Fulana');
    expect(lines.map((l) => [l.description, l.amount, l.n, l.m])).toEqual([
      ['Mercado', 51607, 2, 2], ['Loja', 3100, 1, 1], ['Loja.com Online', 26668, 1, 3],
      ['Posto', 125050, 1, 1], ['Café', 5120, 1, 1], ['Mercado', 1250, 1, 1],
    ]);
    expect(unreadable).toEqual(['linha sem valor']);
  });
  it('parcela impossível vira à vista', () => {
    expect(parseLines('X 10 3/2').lines[0]).toMatchObject({ n: 1, m: 1 });
  });
});

describe('plano de lançamentos', () => {
  const base = (): Dataset => ({
    ...emptyDataset(),
    cards: [{ id: 'nu', name: 'Nubank', color: '#000', order: 0 }],
    people: [{ id: 'v', name: 'Fulana', order: 0 }],
    categories: [
      { id: 'compras', name: 'Compras', icon: '', color: '', order: 0 },
      { id: 'transp', name: 'Transporte', icon: '', color: '', order: 1 },
    ],
    installments: [
      { id: 'old', description: 'Loja', cardId: 'nu', categoryId: 'compras', usedBy: 'v', total: 81300, count: 5, startMonth: '2026-10', createdAt: 0 },
      { id: 'ok', description: 'Mercado', cardId: 'nu', categoryId: 'compras', usedBy: 'v', total: 103214, count: 2, startMonth: '2026-10', createdAt: 0 },
    ],
  });
  const opts = { cardId: 'nu', personId: 'v', month: '2026-11', date: '2026-11-07', defaultCategoryId: 'compras' };

  it('reconhece parcelas existentes, corrige centavos e cria o que falta', () => {
    const d = base();
    const { items } = planPaste(d, `Mercado - 516,07 2/2
Loja - 162,72 2/5
Roupas - 119,93 1/3
Antiga - 50 3/4
Posto Central - 200
Posto Central - 200`, opts);
    expect(items.map((i) => [i.action, i.include])).toEqual([
      ['exists', false], ['fix', true], ['installment', true], ['old-installment', true], ['cash', true], ['duplicate', false],
    ]);
    expect(items[4].categoryId).toBe('transp');

    const r = applyPlan(d, items, opts, id);
    expect(r.installments.map((i) => [i.description, i.total, i.count, i.startMonth])).toEqual([
      ['Roupas', 35979, 3, '2026-11'], ['Antiga', 20000, 4, '2026-09'],
    ]);
    expect(r.fixes).toEqual([expect.objectContaining({ id: 'old', total: 81360 })]);
    // nov: 516,07 + 162,72 + 119,93 + 50 + 200
    expect(shareOnCard(r.data, 'nu', 'v', '2026-11')).toBe(51607 + 16272 + 11993 + 5000 + 20000);
    expect(shareOnCard(r.data, 'nu', ME, '2026-11')).toBe(0);
  });

  it('não lança de novo o que já foi lançado', () => {
    const d = base();
    const first = applyPlan(d, planPaste(d, 'Posto Central - 200\nRoupas - 119,93 1/3', opts).items, opts, id);
    const again = planPaste(first.data, 'Posto Central - 200\nRoupas - 119,93 1/3', opts).items;
    expect(again.map((i) => i.action)).toEqual(['duplicate', 'exists']);
    expect(applyPlan(first.data, again, opts, id).transactions).toHaveLength(0);
  });
});

// Conferência com uma fatura real: os dados ficam em dados/ (fora do Git), nada pessoal aqui.
const CONF = 'dados/conferencia-lista.json';
describe.skipIf(!existsSync(CONF))('lista real da fatura (só no computador)', () => {
  it('a lista colada leva a parte da pessoa ao total exato da fatura', () => {
    const c = JSON.parse(readFileSync(CONF, 'utf8'));
    const data = parseBackup(readFileSync(c.backup, 'utf8'));
    const person = data.people.find((p) => p.name === c.pessoa)!;
    const card = data.cards.find((x) => x.name === c.cartao)!;
    const o = { cardId: card.id, personId: person.id, month: c.mes, date: `${c.mes}-07`, defaultCategoryId: data.categories[0].id };
    const { items, unreadable, header } = planPaste(data, readFileSync(c.lista, 'utf8'), o);
    expect(unreadable).toEqual([]);
    expect(header).toBe(c.pessoa);
    expect(items.filter((i) => i.action === 'exists')).toHaveLength(c.jaExistem);
    expect(items.filter((i) => i.action === 'fix')).toHaveLength(c.correcoes);
    expect(shareOnCard(data, card.id, person.id, c.mes)).toBe(c.antes);
    const after = applyPlan(data, items, o, id).data;
    expect(shareOnCard(after, card.id, person.id, c.mes)).toBe(c.esperado);
    expect(summarizeMonth(after, c.mes).totalBills - summarizeMonth(data, c.mes).totalBills).toBe(c.esperado - c.antes);
  });
});
