/**
 * Planilha 100% fictícia com números conhecidos, no mesmo formato da planilha real.
 * Diferente do teste contra dados/planilha.xlsx, este também roda na publicação.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { dayTotals, summarizeMonth } from '../engine/engine';
import { importSpreadsheet } from './fromSpreadsheet';

function fixture(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  add('Lançamentos', [
    ['Lançamentos de Cartões'], [], [],
    ['Mês', 'Data', 'Cartão', 'Descrição', 'Categoria', 'Quem usou', 'Valor (R$)', 'Parcela nº', 'Total parcelas', 'Valor parcela', 'Minha parte (R$)', 'Quem paga o resto'],
    ['Novembro/26', 46313, 'Nubank', 'Jantar', 'Lazer', 'Eu', 100, '', '', '', 50, 'Fulana'],
    ['Novembro/26', 46313, 'C6', 'Remédio', 'Saúde', 'Ciclano', 40, '', '', '', '', ''],
    ['Novembro/26', 46313, 'Cartao Novo', 'Livro', 'Educação', 'Eu', 30],
    ['Novembro/26', '', '', '', '', '', ''],
  ]);
  add('Parcelamentos', [
    ['Compras Parceladas'], [], [],
    ['Descrição', 'Cartão', 'Categoria', 'Quem usou', 'Valor TOTAL (R$)', 'Nº parcelas', 'Mês inicial', 'Ano inicial'],
    ['Geladeira', 'Nubank', 'Casa', 'Eu', 1200, 12, 'Dezembro', 2025],
    ['Curso', 'C6', 'Outros', 'Fulana', 300, 3, 'Outubro', 2026],
  ]);
  add('Fixos e Boletos', [
    ['Fixos'], [], [],
    ['Descrição', 'Tipo', 'Forma pgto', 'Cartão', 'Categoria', 'Valor (R$)', 'Dia venc.', 'Ativo?', 'Minha parte (R$)', 'Quem paga o resto', 'Meses que NÃO paga'],
    ['Streaming', 'Assinatura', 'Cartão', 'C6', 'Assinaturas', 60, 8, 'Sim', 20, 'Fulana', ''],
    ['Aluguel', 'Conta', 'Pix', '', 'Casa', 500, 5, 'Sim', '', '', 'Dezembro/26'],
    ['Antigo', 'Conta', 'Boleto', '', 'Casa', 999, 5, 'Não', '', '', ''],
  ]);
  add('Gastos Pix', [['Pix'], [], [], ['Mês', 'Data', 'Descrição', 'Categoria', 'Valor (R$)'], ['Novembro/26', 46320, 'Feira', 'Alimentação', 25]]);
  add('Resumo Mensal', [['Resumo'], [], [], ['', '', '', 'Destino', 'Lisboa'], ['', '', '', 'Meta (R$)', 5000]]);
  add('Terceiros', [
    ['Terceiros'], [], [], [],
    ['Pessoa', 'Nubank', '', '', '', '', '', '', '', '', 'Mês', 'Fulana', 'Ciclano', '', 'Mês', 'Fulana', 'Ciclano'],
    ['Fulana', '', '', '', '', '', '', '', '', '', 'Novembro/26', 15, 0, '', 'Novembro/26', 0, 7],
  ].map((r) => r));
  add('Histórico Anual', [
    ['Histórico'], [], [],
    ['Mês', 'Renda', 'Gastos totais', 'A receber terceiros', 'Gasto próprio', 'Saldo', 'Guardado', 'Reserva acumulada'],
    ['Janeiro/26', 2000, 0, 0, 0, 0, 100, 100],
    ['Novembro/26', 3000, 0, 0, 0, 0, 200, 300],
    ['Dezembro/26', 3000, 0, 0, 0, 0, 0, 300],
  ]);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('importação de planilha (dados fictícios)', () => {
  const { data, warnings } = importSpreadsheet(fixture());
  const name = (id: string | null) => data.cards.find((c) => c.id === id)?.name;

  it('cria o que não existia, ignora inativo e linha vazia', () => {
    expect(data.transactions.filter((t) => t.kind === 'card')).toHaveLength(3);
    expect(data.recurring.map((r) => r.description)).toEqual(['Streaming', 'Aluguel']);
    expect(data.cards.some((c) => c.name === 'Cartao Novo')).toBe(true);
    expect(data.categories.some((c) => c.name === 'Educação')).toBe(true);
    expect(warnings.join()).toContain('Antigo');
    expect(data.goals[0]).toMatchObject({ destination: 'Lisboa', target: 500000 });
  });

  it('calcula novembro com os números esperados', () => {
    const s = summarizeMonth(data, '2026-11');
    const card = (n: string | null) => s.cards.find((c) => (n === null ? c.cardId === null : name(c.cardId) === n));
    expect(card('Nubank')).toMatchObject({ total: 20000, mine: 15000 }); // 100 + 100 da 12ª parcela
    expect(card('C6')).toMatchObject({ total: 20000, mine: 2000 }); // 40 + 60 + 100 do curso
    expect(card('Cartao Novo')).toMatchObject({ total: 3000, mine: 3000 });
    expect(card(null)).toMatchObject({ total: 50000, mine: 50000 });
    expect(s.totalBills).toBe(93000);
    expect(s.toReceive).toBe(23000);
    expect(s.totalMine).toBe(70000);
    expect(s.pixMine).toBe(2500);
    expect(s.salary).toBe(300000);
    expect(s.incomeFromOthers).toBe(700);
    expect(s.sentToOthers).toBe(1500);
    expect(s.saved).toBe(20000);
    expect(s.freeBalance).toBe(300000 + 700 - 70000 - 20000 - 2500 - 1500);
    const net = (n: string) => s.people.find((p) => data.people.find((x) => x.id === p.personId)?.name === n)?.net;
    expect(net('Fulana')).toBe(5000 + 4000 + 10000 - 1500);
    expect(net('Ciclano')).toBe(4000 + 700);
  });

  it('parcela vira o ano e mês pulado não cobra', () => {
    expect(summarizeMonth(data, '2025-12').totalBills).toBe(10000);
    expect(summarizeMonth(data, '2026-12').cards.find((c) => c.cardId === null)).toBeUndefined();
    expect(summarizeMonth(data, '2026-12').lines.some((l) => l.description === 'Geladeira')).toBe(false);
  });

  it('calendário mostra compra parcelada no dia em que foi feita', () => {
    const d = { ...data, installments: [{ ...data.installments[0], purchaseDate: '2026-11-20', split: { myShare: 50000, restPersonId: 'x' } }] };
    expect(dayTotals(d, '2026-11-20', '2026-11-20').get('2026-11-20')).toMatchObject({ spentTotal: 120000, spentMine: 50000 });
  });
});
