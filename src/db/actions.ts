import { db, newId } from './db';
import { defaultCards, defaultCategories, defaultPeople, PALETTE } from './defaults';
import type { Card, Category, Installment, Person, Recurring, SalaryChange, Settlement, Transaction } from './types';
import type { Cents } from '../lib/money';
import type { Month } from '../lib/months';

/** Na primeira vez que o app abre, cria cartões, categorias e pessoas padrão. */
export async function ensureDefaults() {
  const seeded = await db.meta.get('seeded');
  if (seeded) return;
  await db.transaction('rw', db.cards, db.categories, db.people, db.meta, async () => {
    if ((await db.cards.count()) === 0) await db.cards.bulkAdd(defaultCards());
    if ((await db.categories.count()) === 0) await db.categories.bulkAdd(defaultCategories());
    if ((await db.people.count()) === 0) await db.people.bulkAdd(defaultPeople());
    await db.meta.put({ key: 'seeded', value: true });
  });
}

export async function saveTransaction(t: Omit<Transaction, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  const full: Transaction = { ...t, id: t.id ?? newId(), createdAt: t.createdAt ?? Date.now() };
  await db.transactions.put(full);
  return full;
}
export const deleteTransaction = (id: string) => db.transactions.delete(id);

export async function saveInstallment(i: Omit<Installment, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  const full: Installment = { ...i, id: i.id ?? newId(), createdAt: i.createdAt ?? Date.now() };
  await db.installments.put(full);
  return full;
}
export const deleteInstallment = (id: string) => db.installments.delete(id);

export async function addCard(name: string, closingDay?: number): Promise<Card> {
  const order = await db.cards.count();
  const c: Card = { id: newId(), name: name.trim(), color: PALETTE[order % PALETTE.length], closingDay, order };
  await db.cards.add(c);
  return c;
}
export async function addCategory(name: string, icon = '🏷️'): Promise<Category> {
  const order = await db.categories.count();
  const c: Category = { id: newId(), name: name.trim(), icon, color: PALETTE[order % PALETTE.length], order };
  await db.categories.add(c);
  return c;
}
export async function addPerson(name: string): Promise<Person> {
  const order = await db.people.count();
  const p: Person = { id: newId(), name: name.trim(), order };
  await db.people.add(p);
  return p;
}

/** Só apaga se nada usa; senão arquiva (some das listas, mas o histórico continua certo). */
export async function removeCard(id: string) {
  const used = (await db.transactions.where('cardId').equals(id).count()) + (await db.installments.where('cardId').equals(id).count())
    + (await db.recurring.filter((r) => r.cardId === id).count());
  if (used) await db.cards.update(id, { archived: true });
  else await db.cards.delete(id);
  return used ? 'archived' : 'deleted';
}
export async function removeCategory(id: string) {
  const used = (await db.transactions.filter((t) => t.categoryId === id).count()) + (await db.installments.filter((t) => t.categoryId === id).count())
    + (await db.recurring.filter((t) => t.categoryId === id).count());
  if (used) await db.categories.update(id, { archived: true });
  else await db.categories.delete(id);
  return used ? 'archived' : 'deleted';
}
export async function removePerson(id: string) {
  const uses = (x: { usedBy?: string; split?: { restPersonId: string } }) => x.usedBy === id || x.split?.restPersonId === id;
  const used = (await db.transactions.filter(uses).count()) + (await db.installments.filter(uses).count())
    + (await db.recurring.filter((r) => r.split?.restPersonId === id).count())
    + (await db.settlements.where('personId').equals(id).count());
  if (used) await db.people.update(id, { archived: true });
  else await db.people.delete(id);
  return used ? 'archived' : 'deleted';
}

export async function saveSalary(s: Omit<SalaryChange, 'id'> & { id?: string }) {
  await db.salaries.put({ ...s, id: s.id ?? newId() });
}
export const deleteSalary = (id: string) => db.salaries.delete(id);

export async function saveRecurring(r: Omit<Recurring, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  const full: Recurring = { ...r, id: r.id ?? newId(), createdAt: r.createdAt ?? Date.now() };
  await db.recurring.put(full);
  return full;
}
export const deleteRecurring = (id: string) => db.recurring.delete(id);

export async function saveSettlement(s: Omit<Settlement, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  await db.settlements.put({ ...s, id: s.id ?? newId(), createdAt: s.createdAt ?? Date.now() });
}
export const deleteSettlement = (id: string) => db.settlements.delete(id);

/** Define quanto foi guardado no mês (0 apaga). */
export async function setSaving(month: Month, amount: Cents) {
  if (amount) await db.savings.put({ month, amount });
  else await db.savings.delete(month);
}
