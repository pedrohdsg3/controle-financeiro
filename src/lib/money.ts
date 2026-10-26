// Todo valor em dinheiro é guardado em CENTAVOS (número inteiro) para evitar erro de arredondamento.
export type Cents = number;

export const toCents = (reais: number): Cents => Math.round(reais * 100);
export const toReais = (cents: Cents): number => cents / 100;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const fmt = (cents: Cents): string => brl.format(cents / 100);
/** Versão curta para espaços pequenos (ex: célula do calendário): "1.234" */
export const fmtShort = (cents: Cents): string => brlCompact.format(Math.round(cents / 100));

/** Interpreta texto digitado ("12,50", "1.234,5", "12.5") e devolve centavos. */
export function parseMoney(text: string): Cents | null {
  const t = text.trim().replace(/\s|R\$/g, '');
  if (!t) return null;
  let norm = t;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? toCents(n) : null;
}

/**
 * Divide um total em N parcelas inteiras em centavos. O resto da divisão vai para
 * a primeira parcela, então a soma das parcelas é sempre exatamente o total.
 */
export function splitInstallments(total: Cents, count: number): Cents[] {
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base));
}
