import type { Card, Category, Person } from './types';

const slug = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const idFromName = (prefix: string, name: string) => `${prefix}-${slug(name)}`;

export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'order'>[] = [
  { name: 'Alimentação', icon: '🍔', color: '#2a78d6' },
  { name: 'Lazer', icon: '🎉', color: '#eb6834' },
  { name: 'Assinaturas', icon: '📺', color: '#1baf7a' },
  { name: 'Compras', icon: '🛍️', color: '#eda100' },
  { name: 'Transporte', icon: '🚗', color: '#e87ba4' },
  { name: 'Saúde', icon: '💊', color: '#008300' },
  { name: 'Casa', icon: '🏠', color: '#6250d6' },
  { name: 'Outros', icon: '📦', color: '#e34948' },
];

export const DEFAULT_CARDS: Omit<Card, 'id' | 'order'>[] = [
  { name: 'Nubank', color: '#8a05be', closingDay: 8 },
  { name: 'C6', color: '#64748b', closingDay: 5 },
  { name: 'Santander', color: '#ec0000', closingDay: 7 },
  { name: 'Bradesco', color: '#cc092f', closingDay: 10 },
  { name: 'Mercado Pago', color: '#00b1ea', closingDay: 15 },
];

/** Nenhuma pessoa vem no código (o código é público). Elas vêm da planilha, do backup ou são criadas no app. */
export const DEFAULT_PEOPLE: string[] = [];

export const INCOME_CATEGORY_ICON = '💰';

export function defaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: idFromName('cat', c.name), order: i }));
}
export function defaultCards(): Card[] {
  return DEFAULT_CARDS.map((c, i) => ({ ...c, id: idFromName('card', c.name), order: i }));
}
export function defaultPeople(): Person[] {
  return DEFAULT_PEOPLE.map((name, i) => ({ id: idFromName('p', name), name, order: i }));
}

/** Mesma cor em versão para fundo escuro (a versão clara reprova em luminosidade nesse tema). */
const DARK_VARIANT: Record<string, string> = {
  '#2a78d6': '#3987e5', '#eb6834': '#d95926', '#1baf7a': '#199e70', '#eda100': '#c98500',
  '#e87ba4': '#d55181', '#008300': '#008300', '#6250d6': '#9085e9', '#e34948': '#e66767',
};
export const chartColor = (color: string, dark: boolean) => (dark ? DARK_VARIANT[color.toLowerCase()] ?? color : color);

/** Paleta categórica em ordem fixa, validada para daltonismo. */
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
