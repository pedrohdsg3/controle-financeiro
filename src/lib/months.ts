// Meses são sempre representados como texto "AAAA-MM" (ex: "2026-11").
// Datas são "AAAA-MM-DD". Nada de anos fixos no código.
export type Month = string;
export type ISODate = string;

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const makeMonth = (year: number, month1to12: number): Month =>
  `${year}-${String(month1to12).padStart(2, '0')}`;

export const monthParts = (m: Month) => {
  const [y, mm] = m.split('-').map(Number);
  return { year: y, month: mm };
};

export function addMonths(m: Month, delta: number): Month {
  const { year, month } = monthParts(m);
  const idx = year * 12 + (month - 1) + delta;
  return makeMonth(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Diferença em meses: diffMonths("2026-03", "2026-01") = 2 */
export function diffMonths(a: Month, b: Month): number {
  const pa = monthParts(a);
  const pb = monthParts(b);
  return (pa.year - pb.year) * 12 + (pa.month - pb.month);
}

export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export const monthOf = (d: ISODate): Month => d.slice(0, 7);

/** "Novembro/26" */
export function monthLabel(m: Month): string {
  const { year, month } = monthParts(m);
  return `${MONTH_NAMES[month - 1]}/${String(year).slice(2)}`;
}
/** "Novembro de 2026" */
export function monthLabelLong(m: Month): string {
  const { year, month } = monthParts(m);
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}
/** "nov/26" */
export function monthLabelShort(m: Month): string {
  const { year, month } = monthParts(m);
  return `${MONTH_SHORT[month - 1]}/${String(year).slice(2)}`;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Lê "Novembro/26", "novembro/2026" ou só o nome do mês + ano separado. */
export function parseMonthLabel(label: string, yearHint?: number): Month | null {
  const [namePart, yearPart] = label.split('/');
  const idx = MONTH_NAMES.findIndex((n) => norm(n) === norm(namePart ?? ''));
  if (idx < 0) return null;
  let year = yearPart ? Number(yearPart.trim()) : yearHint;
  if (!year || !Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  return makeMonth(year, idx + 1);
}

export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const currentMonth = (): Month => monthOf(todayISO());

export const daysInMonth = (m: Month): number => {
  const { year, month } = monthParts(m);
  return new Date(year, month, 0).getDate();
};
/** 0 = domingo */
export const weekdayOfFirst = (m: Month): number => {
  const { year, month } = monthParts(m);
  return new Date(year, month - 1, 1).getDay();
};

/** Converte número de série de data do Excel (ex: 46244) para "AAAA-MM-DD". */
export function excelSerialToISO(serial: number): ISODate {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}
