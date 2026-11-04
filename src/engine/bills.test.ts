import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup } from '../backup';
import { db, loadDataset, replaceDataset } from '../db/db';
import { emptyDataset, ME, type Dataset } from '../db/types';
import { daysSinceBackup, restoreWithSnapshot, undoRestore } from '../lib/backupFile';
import { parseMoney } from '../lib/money';
import { calendarLink, cashView, dueAlerts, dueDateOf, monthBills, openDebts, openToSend, peopleLedger, allocatePayment, trackingStart } from './bills';
import { summarizeMonth, suggestBillMonth } from './engine';
import { reviewIssues } from './review';

const NOV = '2026-11';
const base = (): Dataset => ({
  ...emptyDataset(),
  cards: [{ id: 'c1', name: 'Cartão', color: '#000', order: 0, dueDay: 15, dueFrom: NOV, closingDay: 8 }],
  people: [{ id: 'p1', name: 'Fulana', order: 0 }],
  transactions: [
    { id: 't1', kind: 'card', date: '2026-10-20', month: NOV, cardId: 'c1', description: 'meu', amount: 10000, usedBy: ME, createdAt: 0 },
    { id: 't2', kind: 'card', date: '2026-10-20', month: NOV, cardId: 'c1', description: 'dela', amount: 4000, usedBy: 'p1', createdAt: 0 },
  ],
});

describe('controle de faturas', () => {
  it('pagamento parcial e recebimento atualizam o que falta', () => {
    const d = base();
    d.cardPayments.push({ id: 'a', cardId: 'c1', month: NOV, amount: 6000, date: '2026-11-10', createdAt: 0 });
    d.receipts.push({ id: 'b', personId: 'p1', month: NOV, cardId: 'c1', amount: 1500, date: '2026-11-10', createdAt: 0 });
    const { bills, totals } = monthBills(d, NOV, '2026-11-10');
    expect(bills[0]).toMatchObject({ total: 14000, mine: 10000, paid: 6000, remaining: 8000, days: 5 });
    expect(bills[0].people[0]).toMatchObject({ personId: 'p1', owed: 4000, received: 1500, pending: 2500 });
    expect(totals).toMatchObject({ remaining: 8000, owed: 4000, pending: 2500 });
    expect(peopleLedger(d, NOV, '2026-11-10')[0]).toMatchObject({ personId: 'p1', spent: 4000, paid: 1500, toReceive: 2500, open: 2500 });
  });

  it('pagar e receber não muda gastos nem saldo do mês', () => {
    const d = base();
    const before = summarizeMonth(d, NOV);
    d.cardPayments.push({ id: 'a', cardId: 'c1', month: NOV, amount: 14000, date: '2026-11-10', createdAt: 0 });
    d.receipts.push({ id: 'b', personId: 'p1', month: NOV, cardId: 'c1', amount: 4000, date: '2026-11-10', createdAt: 0 });
    const after = summarizeMonth(d, NOV);
    expect([after.totalBills, after.totalMine, after.toReceive, after.freeBalance]).toEqual([before.totalBills, before.totalMine, before.toReceive, before.freeBalance]);
  });

  it('o que a pessoa deve na aba Cartões bate com a tela de Terceiros', () => {
    const d = base();
    d.recurring.push({ id: 'r', description: 'x', type: 'Assinatura', payMethod: 'Pix', categoryId: 'c', amount: 3000, dueDay: 5, startMonth: NOV, skipMonths: [], split: { myShare: 1000, restPersonId: 'p1' }, createdAt: 0 });
    const { totals } = monthBills(d, NOV, '2026-11-10');
    expect(totals.owed).toBe(summarizeMonth(d, NOV).people.find((p) => p.personId === 'p1')!.subtotal);
  });

  it('alerta 3 dias antes, some quando paga e não cobra mês anterior ao início do controle', () => {
    const d = base();
    expect(dueAlerts(d, '2026-11-11')).toHaveLength(0);
    expect(dueAlerts(d, '2026-11-12')[0]).toMatchObject({ cardId: 'c1', days: 3, remaining: 14000 });
    expect(dueAlerts(d, '2026-11-20')[0].days).toBe(-5);
    d.cardPayments.push({ id: 'a', cardId: 'c1', month: NOV, amount: 14000, date: '2026-11-13', createdAt: 0 });
    expect(dueAlerts(d, '2026-11-20')).toHaveLength(0);
    const old = base();
    old.transactions[0].month = '2026-10';
    old.transactions[1].month = '2026-10';
    expect(dueAlerts(old, '2026-11-01')).toHaveLength(0);
  });

  it('vencimento dia 31 cai no último dia em meses curtos', () => {
    const card = { id: 'c', name: 'X', color: '', order: 0, dueDay: 31 };
    expect(dueDateOf(card, '2027-02')).toBe('2027-02-28');
    expect(dueDateOf(card, '2026-11')).toBe('2026-11-30');
  });

  it('quem ainda me deve soma meses desde o início do controle, sem futuro', () => {
    const d = base();
    d.transactions.push({ id: 't3', kind: 'card', date: '2026-11-20', month: '2026-12', cardId: 'c1', description: 'f', amount: 500, usedBy: 'p1', createdAt: 0 });
    expect(trackingStart(d, '2026-11-20')).toBe(NOV);
    expect(openDebts(d, '2026-11-20')).toEqual([{ personId: 'p1', pending: 4000, months: [{ month: NOV, pending: 4000 }] }]);
    expect(openDebts(d, '2026-12-20')[0].pending).toBe(4500);
  });

  it('mês da fatura considera vencimento no mês depois do fechamento', () => {
    const card = { id: 'c', name: 'X', color: '', order: 0, closingDay: 28, dueDay: 5 };
    expect(suggestBillMonth(card, '2026-10-20')).toBe('2026-11');
    expect(suggestBillMonth(card, '2026-10-29')).toBe('2026-12');
  });

  it('link da agenda é mensal, no próximo vencimento', () => {
    const url = new URL(calendarLink({ id: 'c', name: 'Nu', color: '', order: 0, dueDay: 15 }, '2026-11-20')!);
    expect(url.searchParams.get('dates')).toBe('20261215/20261216');
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
  });
});

describe('valores digitados', () => {
  it('entende milhar brasileiro e recusa negativo', () => {
    expect(parseMoney('1.500')).toBe(150000);
    expect(parseMoney('1.234.567')).toBe(123456700);
    expect(parseMoney('1.234,50')).toBe(123450);
    expect(parseMoney('12.50')).toBe(1250);
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('banco e backup', () => {
  it('atualização do banco v1 → v2 preserva os dados existentes', async () => {
    db.close();
    await Dexie.delete('controle-financeiro');
    const old = new Dexie('controle-financeiro');
    old.version(1).stores({
      cards: 'id, order', categories: 'id, order', people: 'id, order', transactions: 'id, month, date, kind, cardId',
      installments: 'id, cardId, startMonth', recurring: 'id', salaries: 'id, fromMonth', settlements: 'id, month, personId',
      savings: 'month', goals: 'id', meta: 'key',
    });
    await old.open();
    await old.table('cards').add({ id: 'c1', name: 'Antigo', color: '#000', order: 0 });
    await old.table('transactions').add(base().transactions[0]);
    old.close();

    await db.open();
    const d = await loadDataset();
    expect(d.cards[0].name).toBe('Antigo');
    expect(d.transactions).toHaveLength(1);
    expect(d.cardPayments).toEqual([]);
    expect(d.receipts).toEqual([]);
  });

  it('backup ida e volta restaura tudo; backup antigo (sem as tabelas novas) continua válido', async () => {
    const d = base();
    d.cardPayments.push({ id: 'a', cardId: 'c1', month: NOV, amount: 100, date: '2026-11-10', createdAt: 0 });
    await replaceDataset(d);
    const text = JSON.stringify(makeBackup(await loadDataset()));
    await replaceDataset(emptyDataset());
    await replaceDataset(parseBackup(text));
    const back = await loadDataset();
    expect(back.cardPayments).toHaveLength(1);
    expect(back.transactions).toHaveLength(2);

    const legacy = JSON.parse(text);
    delete legacy.data.cardPayments;
    delete legacy.data.receipts;
    expect(parseBackup(JSON.stringify(legacy)).receipts).toEqual([]);
    expect(() => parseBackup('{"app":"outro"}')).toThrow();
  });
});

describe('service worker de notificação', () => {
  const load = () => {
    const self: { __pickDueAlerts?: (s: unknown, t: string) => { days: number }[] } = {};
    vm.runInNewContext(readFileSync('public/notify-sw.js', 'utf8'), { self });
    return self.__pickDueAlerts!;
  };
  it('avisa de 3 dias antes até 7 depois do vencimento', () => {
    const pick = load();
    const s = [{ cardId: 'c', cardName: 'X', month: NOV, dueDate: '2026-11-15', remaining: 100 }];
    expect(pick(s, '2026-11-11')).toHaveLength(0);
    expect(pick(s, '2026-11-12')[0].days).toBe(3);
    expect(pick(s, '2026-11-22')[0].days).toBe(-7);
    expect(pick(s, '2026-11-23')).toHaveLength(0);
    expect(pick(null, '2026-11-12')).toHaveLength(0);
  });
});

describe('saldo em caixa', () => {
  const dec = () => {
    const d = base();
    d.salaries.push({ id: 's', fromMonth: '2026-01', amount: 100000 });
    d.settlements.push(
      { id: 'a', month: NOV, personId: 'p1', direction: 'paysMe', amount: 700, createdAt: 0 },
      { id: 'b', month: NOV, personId: 'p1', direction: 'iOwe', amount: 500, createdAt: 0 },
    );
    return d;
  };
  it('previsto conta tudo; caixa só o que aconteceu; pior caso desconta o pendente', () => {
    const d = dec();
    const s = summarizeMonth(d, NOV);
    expect(s.freeBalance).toBe(100000 + 700 - 10000 - 500);
    let c = cashView(d, NOV, '2026-11-10');
    expect(c.cash).toBe(100000);
    expect(c.ifNoOnePays).toBe(s.freeBalance - 4000 - 700);

    d.cardPayments.push({ id: 'p', cardId: 'c1', month: NOV, amount: 14000, date: '2026-11-10', createdAt: 0 });
    d.receipts.push({ id: 'r', personId: 'p1', month: NOV, cardId: 'c1', amount: 4000, date: '2026-11-10', createdAt: 0 });
    d.settlements[0].doneAt = '2026-11-10';
    d.settlements[1].doneAt = '2026-11-10';
    c = cashView(d, NOV, '2026-11-10');
    expect(c.cash).toBe(100000 + 4000 + 700 - 14000 - 500);
    // Com tudo quitado, os três números coincidem: o previsto virou realidade.
    expect(c.ifNoOnePays).toBe(summarizeMonth(d, NOV).freeBalance);
    expect(c.cash).toBe(summarizeMonth(d, NOV).freeBalance);
    expect(summarizeMonth(d, NOV).freeBalance).toBe(s.freeBalance);
  });
});

describe('revisão de lançamentos', () => {
  const tx = (over: object) => ({ id: 't', kind: 'card' as const, date: '2026-11-01', month: NOV, cardId: 'c1', description: 'Compra', categoryId: 'cat', amount: 5000, usedBy: ME, createdAt: 0, ...over });
  const issues = (...txs: object[]) => {
    const d = base();
    d.categories = [{ id: 'cat', name: 'A', icon: '', color: '', order: 0 }];
    d.transactions = txs.map((t) => tx(t));
    return reviewIssues(d).map((i) => i.key.split(':')[0]);
  };
  it('lançamento normal não gera aviso', () => expect(issues({})).toEqual([]));
  it('valor baixo (provável 1.500 lido como 1,50)', () => expect(issues({ amount: 150 })).toEqual(['valor']));
  it('compra depois da fatura ou fatura distante', () => {
    expect(issues({ date: '2026-12-07' })).toEqual(['data']);
    expect(issues({ date: '2026-07-01' })).toEqual(['data']);
  });
  it('sem categoria e categoria caída por padrão', () => {
    expect(issues({ categoryId: undefined })).toEqual(['categoria']);
    expect(issues({ description: 'Gasto' })).toEqual(['categoria']);
  });
  it('divisão sem pessoa', () => expect(issues({ split: { myShare: 1000, restPersonId: '' } })).toEqual(['pessoa']));
  it('repetido só marca o segundo', () => {
    expect(issues({ id: 'a' }, { id: 'b' })).toEqual(['duplicado']);
  });
  it('"Está certo" não repete', () => {
    const d = base();
    d.categories = [{ id: 'cat', name: 'A', icon: '', color: '', order: 0 }];
    d.transactions = [tx({ amount: 150 })];
    expect(reviewIssues(d, ['valor:t'])).toEqual([]);
  });
});

describe('restauração com rede de segurança', () => {
  it('guarda os dados atuais e permite desfazer', async () => {
    const a = base();
    await replaceDataset(a);
    const novo = emptyDataset();
    novo.people.push({ id: 'z', name: 'Outro', order: 0 });
    await restoreWithSnapshot(novo);
    expect((await loadDataset()).transactions).toHaveLength(0);
    expect(await undoRestore()).toBe(true);
    const back = await loadDataset();
    expect(back.transactions).toHaveLength(2);
    expect(await undoRestore()).toBe(false);
  });
  it('conta dias desde o último backup', () => {
    expect(daysSinceBackup(undefined, '2026-11-10')).toBeNull();
    expect(daysSinceBackup('2026-11-03', '2026-11-10')).toBe(7);
  });
});

describe('extrato por pessoa', () => {
  const data = () => {
    const d = base();
    d.settlements.push(
      { id: 'f', month: NOV, personId: 'p1', direction: 'paysMe', amount: 1000, createdAt: 0 },
      { id: 'e', month: NOV, personId: 'p1', direction: 'iOwe', amount: 7000, createdAt: 0 },
    );
    return d;
  };
  const today = '2026-11-10';

  it('saldo em aberto começa igual ao da planilha e cai conforme confirma', () => {
    const d = data();
    let p = peopleLedger(d, NOV, today)[0];
    const planilha = summarizeMonth(d, NOV).people.find((x) => x.personId === 'p1')!.net;
    expect(p).toMatchObject({ spent: 4000, owes: 5000, paid: 0, toReceive: 5000, toSend: 7000, open: -2000 });
    expect(p.open).toBe(planilha);

    d.receipts.push({ id: 'r', personId: 'p1', month: NOV, cardId: 'c1', amount: 4000, date: today, createdAt: 0 });
    d.settlements[0].doneAt = today;
    p = peopleLedger(d, NOV, today)[0];
    expect(p).toMatchObject({ paid: 5000, toReceive: 0, open: -7000, sources: [] });

    d.settlements[1].doneAt = today;
    p = peopleLedger(d, NOV, today)[0];
    expect(p).toMatchObject({ toSend: 0, sent: 7000, open: 0 });
    expect(summarizeMonth(d, NOV).people.find((x) => x.personId === 'p1')!.net).toBe(planilha);
  });

  it('pessoa só com combinado por fora aparece', () => {
    const d = base();
    d.transactions = [];
    d.settlements.push({ id: 'x', month: NOV, personId: 'p1', direction: 'iOwe', amount: 500, createdAt: 0 });
    expect(peopleLedger(d, NOV, today)[0]).toMatchObject({ personId: 'p1', spent: 0, open: -500 });
  });

  it('distribui o pagamento entre os cartões na ordem', () => {
    const s = [{ cardId: 'a', pending: 1000 }, { cardId: null, pending: 500 }];
    expect(allocatePayment(s, 1200)).toEqual([{ cardId: 'a', amount: 1000 }, { cardId: null, amount: 200 }]);
    expect(allocatePayment(s, 300)).toEqual([{ cardId: 'a', amount: 300 }]);
    expect(allocatePayment(s, 9000)).toHaveLength(2);
  });

  it('em aberto até hoje inclui por fora pendente e o que devo enviar', () => {
    const d = data();
    expect(openDebts(d, today)[0]).toMatchObject({ personId: 'p1', pending: 5000 });
    expect(openToSend(d, today)).toEqual([{ personId: 'p1', amount: 7000, months: [NOV] }]);
    d.settlements[1].doneAt = today;
    expect(openToSend(d, today)).toEqual([]);
  });
});
