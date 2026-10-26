import Dexie, { type EntityTable } from 'dexie';
import type {
  Card, Category, Dataset, Goal, Installment, Meta, Person, Recurring,
  SalaryChange, Saving, Settlement, Transaction,
} from './types';

export class FinDB extends Dexie {
  cards!: EntityTable<Card, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  people!: EntityTable<Person, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  installments!: EntityTable<Installment, 'id'>;
  recurring!: EntityTable<Recurring, 'id'>;
  salaries!: EntityTable<SalaryChange, 'id'>;
  settlements!: EntityTable<Settlement, 'id'>;
  savings!: EntityTable<Saving, 'month'>;
  goals!: EntityTable<Goal, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor() {
    super('controle-financeiro');
    this.version(1).stores({
      cards: 'id, order',
      categories: 'id, order',
      people: 'id, order',
      transactions: 'id, month, date, kind, cardId',
      installments: 'id, cardId, startMonth',
      recurring: 'id',
      salaries: 'id, fromMonth',
      settlements: 'id, month, personId',
      savings: 'month',
      goals: 'id',
      meta: 'key',
    });
  }
}

export const db = new FinDB();

// Se uma versão mais nova do app (em outra aba/janela) precisar atualizar o banco,
// esta fecha a conexão e recarrega, em vez de travar as duas.
db.on('versionchange', () => {
  db.close();
  if (typeof window !== 'undefined') window.location.reload();
  return false;
});

export const TABLES = [
  'cards', 'categories', 'people', 'transactions', 'installments',
  'recurring', 'salaries', 'settlements', 'savings', 'goals',
] as const satisfies readonly (keyof Dataset)[];

export async function loadDataset(): Promise<Dataset> {
  const entries = await Promise.all(TABLES.map((t) => db.table(t).toArray()));
  return Object.fromEntries(TABLES.map((t, i) => [t, entries[i]])) as unknown as Dataset;
}

/** Substitui TODOS os dados pelos do dataset (usado na importação/restauração). */
export async function replaceDataset(data: Dataset): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd(data[t] ?? []);
    }
  });
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
