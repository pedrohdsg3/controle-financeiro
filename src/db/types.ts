import type { Cents } from '../lib/money';
import type { ISODate, Month } from '../lib/months';

/** Id especial da pessoa "Eu" (não fica na tabela de pessoas). */
export const ME = 'me';

export interface Card {
  id: string;
  name: string;
  color: string;
  /** Compras feitas a partir deste dia caem na fatura do mês seguinte. */
  closingDay?: number;
  archived?: boolean;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  archived?: boolean;
  order: number;
}

export interface Person {
  id: string;
  name: string;
  archived?: boolean;
  order: number;
}

/**
 * Divisão de um gasto: "minha parte" e quem paga o resto.
 * Sem split: se usedBy = Eu, tudo é meu; se usedBy = outra pessoa, tudo é dela.
 */
export interface Split {
  myShare: Cents;
  restPersonId: string;
}

export type TxKind = 'card' | 'pix' | 'income';

export interface Transaction {
  id: string;
  kind: TxKind;
  /** Data em que aconteceu (aparece no calendário). */
  date: ISODate;
  /** Mês em que conta: mês da fatura (cartão) ou mês de competência (Pix/receita). */
  month: Month;
  cardId?: string;
  description: string;
  categoryId?: string;
  amount: Cents;
  usedBy: string;
  split?: Split;
  createdAt: number;
}

export interface Installment {
  id: string;
  description: string;
  cardId: string;
  categoryId: string;
  usedBy: string;
  /** Divisão sobre o valor TOTAL; cada parcela recebe a proporção. */
  split?: Split;
  total: Cents;
  count: number;
  /** Mês da fatura da 1ª parcela. */
  startMonth: Month;
  purchaseDate?: ISODate;
  createdAt: number;
}

export type RecurringType = 'Boleto' | 'Assinatura' | 'Conta' | 'Fixo/Mensal';
export type PayMethod = 'Boleto' | 'Cartão' | 'Débito' | 'Pix';

export interface Recurring {
  id: string;
  description: string;
  type: RecurringType;
  payMethod: PayMethod;
  /** Se tiver cartão, entra na fatura dele; senão vai para "Fixos/Boletos (não-cartão)". */
  cardId?: string;
  categoryId: string;
  amount: Cents;
  dueDay: number;
  startMonth: Month;
  /** Último mês cobrado (vazio = continua). Desativar = preencher este campo. */
  endMonth?: Month;
  skipMonths: Month[];
  split?: Split;
  createdAt: number;
}

/** Salário líquido a partir de um mês (vale até a próxima mudança). */
export interface SalaryChange {
  id: string;
  fromMonth: Month;
  amount: Cents;
}

/** "Vai me passar por fora" (paysMe) ou "Eu devo enviar" (iOwe). */
export interface Settlement {
  id: string;
  month: Month;
  personId: string;
  direction: 'paysMe' | 'iOwe';
  amount: Cents;
  note?: string;
  createdAt: number;
}

export interface Saving {
  month: Month;
  amount: Cents;
}

export interface Goal {
  id: 'main';
  destination: string;
  target: Cents;
}

export interface Meta {
  key: string;
  value: unknown;
}

/** Tudo o que o app guarda. É também o formato do backup JSON. */
export interface Dataset {
  cards: Card[];
  categories: Category[];
  people: Person[];
  transactions: Transaction[];
  installments: Installment[];
  recurring: Recurring[];
  salaries: SalaryChange[];
  settlements: Settlement[];
  savings: Saving[];
  goals: Goal[];
}

export const emptyDataset = (): Dataset => ({
  cards: [], categories: [], people: [], transactions: [], installments: [],
  recurring: [], salaries: [], settlements: [], savings: [], goals: [],
});
