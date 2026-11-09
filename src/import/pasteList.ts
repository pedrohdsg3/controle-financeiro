/**
 * "Colar lista da fatura": transforma linhas como "Mercado - 120,50 2/2" em lançamentos.
 * Tudo aqui é puro (não grava nada): gera um plano que a tela mostra como prévia.
 */
import { ME, type Dataset, type Installment, type Transaction } from '../db/types';
import { installmentNumberIn, summarizeMonth } from '../engine/engine';
import { splitInstallments, type Cents } from '../lib/money';
import { addMonths, type ISODate, type Month } from '../lib/months';

export interface ParsedLine {
  raw: string;
  description: string;
  amount: Cents;
  /** Parcela atual e total (1/3). Sem parcela = à vista. */
  n: number;
  m: number;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const LINE = /^(.*?)[\s\-–—:]*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:(\d{1,2})\s*\/\s*(\d{1,2}))?\s*$/i;

function parseAmount(s: string): Cents {
  const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  return Math.round(Number(t) * 100);
}

export function parseLines(text: string): { lines: ParsedLine[]; header?: string; unreadable: string[] } {
  const lines: ParsedLine[] = [];
  const unreadable: string[] = [];
  let header: string | undefined;
  for (const raw0 of text.split(/\r?\n/)) {
    const raw = raw0.trim().replace(/^[•*\-–]\s+/, '');
    if (!raw) continue;
    const h = raw.match(/^([^\d]+):$/);
    if (h) { header ??= h[1].trim(); continue; }
    const m = raw.match(LINE);
    const description = m?.[1].trim().replace(/[\s\-–—:]+$/, '');
    const amount = m ? parseAmount(m[2]) : 0;
    if (!m || !description || !(amount > 0)) { unreadable.push(raw); continue; }
    let n = m[3] ? Number(m[3]) : 1;
    let total = m[4] ? Number(m[4]) : 1;
    if (!(total >= 1) || !(n >= 1) || n > total) { n = 1; total = 1; }
    lines.push({ raw, description, amount, n, m: total });
  }
  return { lines, header, unreadable };
}

const CATEGORY_HINTS: [RegExp, string][] = [
  [/\b(posto|gasolina|combust|uber|99 ?pop|99\b|estacion|pedagio|onibus)/, 'Transporte'],
  [/\b(restaur|lanche|pizza|frango|brasa|cafe|padaria|burger|mc ?donald|ifood|sushi|churras|espetinho|acai|sorvet|bar\b|lanchonete|mercado|atacad|atacarejo|supermerc)/, 'Alimentação'],
  [/\b(farma|drogas|drogaria|clinica|medic|odonto|exame)/, 'Saúde'],
  [/\b(netflix|spotify|prime|hbo|disney|youtube|assinatura)/, 'Assinaturas'],
];
export function guessCategory(data: Dataset, description: string, fallback: string): string {
  const d = norm(description);
  for (const [re, name] of CATEGORY_HINTS) {
    if (re.test(d)) {
      const c = data.categories.find((x) => !x.archived && norm(x.name) === norm(name));
      if (c) return c.id;
    }
  }
  return fallback;
}

export type PlanAction = 'cash' | 'installment' | 'old-installment' | 'exists' | 'fix' | 'duplicate';

export interface PlanItem {
  line: ParsedLine;
  action: PlanAction;
  include: boolean;
  categoryId: string;
  /** Parcelamento existente reconhecido (exists/fix). */
  existing?: Installment;
  /** Explicação curta para a prévia. */
  note: string;
}

export interface PasteOptions {
  cardId: string;
  personId: string;
  month: Month;
  date: ISODate;
  defaultCategoryId: string;
}

/** Tolerância para reconhecer uma parcela já cadastrada com valor um pouco diferente. */
const FIX_TOLERANCE = 100; // R$ 1,00

export function planPaste(data: Dataset, text: string, o: PasteOptions): { items: PlanItem[]; unreadable: string[]; header?: string } {
  const { lines, unreadable, header } = parseLines(text);
  const used = new Set<string>();
  const seenNow = new Set<string>();
  const items = lines.map((line): PlanItem => {
    const categoryId = guessCategory(data, line.description, o.defaultCategoryId);
    if (line.m > 1) {
      // Parcela de algo que já pode estar no app: mesmo cartão, pessoa, nº de parcelas e parcela deste mês.
      const candidates = data.installments.filter((i) => !used.has(i.id) && i.cardId === o.cardId && i.usedBy === o.personId
        && i.count === line.m && installmentNumberIn(i, o.month) === line.n);
      const parcelOf = (i: Installment) => splitInstallments(i.total, i.count)[line.n - 1];
      const exact = candidates.find((i) => parcelOf(i) === line.amount);
      const near = exact ?? candidates.find((i) => Math.abs(parcelOf(i) - line.amount) <= FIX_TOLERANCE);
      if (near) {
        used.add(near.id);
        if (exact) return { line, action: 'exists', include: false, categoryId, existing: near, note: `Já está no app (“${near.description}”)` };
        return { line, action: 'fix', include: true, categoryId, existing: near, note: `No app a parcela é ${(parcelOf(near) / 100).toFixed(2).replace('.', ',')}; corrigir` };
      }
      if (line.n > 1) {
        const first = addMonths(o.month, -(line.n - 1));
        return { line, action: 'old-installment', include: true, categoryId, note: `Parcelamento novo no app, começando em ${first} (inclui parcelas anteriores)` };
      }
      return { line, action: 'installment', include: true, categoryId, note: `${line.m}× a partir deste mês` };
    }
    const key = `${norm(line.description)}|${line.amount}`;
    const dup = seenNow.has(key) || data.transactions.some((t) => t.kind === 'card' && t.cardId === o.cardId && t.month === o.month
      && t.usedBy === o.personId && t.amount === line.amount && norm(t.description) === norm(line.description));
    seenNow.add(key);
    if (dup) return { line, action: 'duplicate', include: false, categoryId, note: 'Parece já lançado' };
    return { line, action: 'cash', include: true, categoryId, note: 'À vista' };
  });
  return { items, unreadable, header };
}

/** Aplica o plano numa cópia dos dados (para a prévia e para gravar). */
export function applyPlan(data: Dataset, items: PlanItem[], o: PasteOptions, makeId: () => string, now = Date.now()): {
  data: Dataset; transactions: Transaction[]; installments: Installment[]; fixes: Installment[];
} {
  const transactions: Transaction[] = [];
  const installments: Installment[] = [];
  const fixes: Installment[] = [];
  for (const it of items) {
    if (!it.include) continue;
    const { line } = it;
    if (it.action === 'cash' || it.action === 'duplicate') {
      transactions.push({
        id: makeId(), kind: 'card', date: o.date, month: o.month, cardId: o.cardId, description: line.description,
        categoryId: it.categoryId, amount: line.amount, usedBy: o.personId, createdAt: now,
      });
    } else if (it.action === 'installment' || it.action === 'old-installment') {
      installments.push({
        id: makeId(), description: line.description, cardId: o.cardId, categoryId: it.categoryId, usedBy: o.personId,
        total: line.amount * line.m, count: line.m, startMonth: addMonths(o.month, -(line.n - 1)),
        purchaseDate: line.n === 1 ? o.date : undefined, createdAt: now,
      });
    } else if ((it.action === 'fix' || it.action === 'exists') && it.existing) {
      fixes.push({ ...it.existing, total: line.amount * line.m });
    }
  }
  const fixed = new Map(fixes.map((f) => [f.id, f]));
  return {
    data: {
      ...data,
      transactions: [...data.transactions, ...transactions],
      installments: [...data.installments.map((i) => fixed.get(i.id) ?? i), ...installments],
    },
    transactions, installments, fixes,
  };
}

/** Quanto a pessoa (ou eu) tem no cartão naquele mês. */
export function shareOnCard(data: Dataset, cardId: string, personId: string, month: Month): Cents {
  const s = summarizeMonth(data, month);
  if (personId === ME) return s.cards.find((c) => c.cardId === cardId)?.mine ?? 0;
  return s.people.find((p) => p.personId === personId)?.byCard[cardId] ?? 0;
}
