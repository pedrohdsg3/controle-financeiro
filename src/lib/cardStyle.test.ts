import { describe, expect, it } from 'vitest';
import type { Card } from '../db/types';
import { cardFinish, cardProduct, contrast, faceStyle, readableOn, shade } from './cardStyle';

const card = (over: Partial<Card>): Card => ({ id: 'c', name: 'Banco', color: '#8a05be', order: 0, ...over });

describe('aparência dos cartões', () => {
  it('C6 nasce como Carbon Black, mas a escolha do usuário manda', () => {
    expect(cardFinish(card({ name: 'C6' }))).toBe('carbon');
    expect(cardProduct(card({ name: 'C6' }))).toBe('Carbon Black');
    expect(cardProduct(card({ name: 'C6 Carbon' }))).toBe('');
    expect(cardFinish(card({ name: 'C6', finish: 'metal' }))).toBe('metal');
    expect(cardProduct(card({ name: 'C6', product: 'Gold' }))).toBe('Gold');
    expect(cardFinish(card({ name: 'Nubank' }))).toBe('color');
  });
  it('texto do cartão é legível em qualquer cor, inclusive na ponta escura', () => {
    for (const color of ['#8a05be', '#64748b', '#ec0000', '#cc092f', '#00b1ea', '#ffe600', '#ffffff', '#000000']) {
      const text = readableOn(color);
      expect(Math.max(contrast(color, text), contrast(shade(color, 0.28), text)), color).toBeGreaterThanOrEqual(3);
    }
    expect(readableOn('#00b1ea')).toBe('#14161b');
    expect(readableOn('#8a05be')).toBe('#ffffff');
  });
  it('cor inválida não quebra o cartão', () => {
    expect(faceStyle(card({ color: 'azul' })).background).toContain('#64748b');
  });
});
