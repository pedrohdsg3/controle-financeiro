/** Aparência dos cartões: desenho feito só com CSS, sem logos nem dados reais do cartão. */
import type { Card, CardFinish } from '../db/types';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

export const shade = (hex: string, amount: number) => toHex(rgb(hex).map((v) => v * (1 - amount)));

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Texto branco ou escuro, o que tiver mais contraste sobre a cor. */
export const readableOn = (hex: string) => (contrast(hex, '#ffffff') >= contrast(hex, '#14161b') ? '#ffffff' : '#14161b');

export const FINISHES: { id: CardFinish; label: string }[] = [
  { id: 'color', label: 'Cor do cartão' }, { id: 'carbon', label: 'Carbono' }, { id: 'black', label: 'Preto fosco' }, { id: 'metal', label: 'Metal' },
];

const isC6 = (c: Card) => /^c6\b/i.test(c.name.trim());
export const cardFinish = (c: Card): CardFinish => c.finish ?? (isC6(c) ? 'carbon' : 'color');
export const cardProduct = (c: Card): string => c.product ?? (isC6(c) && !/carbon/i.test(c.name) ? 'Carbon Black' : '');

export function faceStyle(c: Card): { background: string; color: string; finish: CardFinish } {
  const finish = cardFinish(c);
  if (finish === 'carbon') {
    return {
      finish, color: '#e8e8e8',
      background: 'linear-gradient(115deg, rgba(255,255,255,.09), transparent 42%), '
        + 'repeating-linear-gradient(45deg, #1b1b1b 0 3px, #101010 3px 6px), repeating-linear-gradient(-45deg, #1b1b1b 0 3px, #101010 3px 6px), #121212',
    };
  }
  if (finish === 'black') return { finish, color: '#ececec', background: 'linear-gradient(135deg, #2a2a2a, #0d0d0d)' };
  if (finish === 'metal') return { finish, color: '#14161b', background: 'linear-gradient(120deg, #e4e6e9, #b4b8be 45%, #dfe1e4 70%, #a7abb1)' };
  const base = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#64748b';
  return { finish, color: readableOn(base), background: `linear-gradient(135deg, ${base}, ${shade(base, 0.28)})` };
}
