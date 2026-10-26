/**
 * Importa os DADOS da planilha antiga (PLANILHA DE GASTOS 3.0).
 * Só lê os valores digitados — nenhuma fórmula é usada. Os totais são recalculados pelo motor.
 */
import * as XLSX from 'xlsx';
import { toCents } from '../lib/money';
import { excelSerialToISO, makeMonth, parseMonthLabel, type Month } from '../lib/months';
import { defaultCards, defaultCategories, defaultPeople, idFromName, PALETTE } from '../db/defaults';
import {
  emptyDataset, ME, type Dataset, type PayMethod, type RecurringType, type SalaryChange, type Split,
} from '../db/types';

export interface ImportReport {
  data: Dataset;
  counts: Record<string, number>;
  warnings: string[];
}

type Row = unknown[];
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  const s = str(v).replace(/\./g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

function rows(wb: XLSX.WorkBook, sheetName: string): Row[] {
  const name = wb.SheetNames.find((n) => norm(n) === norm(sheetName));
  if (!name) return [];
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
}

/** Acha a linha de cabeçalho que contém o texto e devolve índice + mapa coluna→posição. */
function header(rs: Row[], mustHave: string) {
  const idx = rs.findIndex((r) => r.some((c) => norm(str(c)) === norm(mustHave)));
  const cols = new Map<string, number>();
  if (idx >= 0) rs[idx].forEach((c, i) => { const k = norm(str(c)); if (k && !cols.has(k)) cols.set(k, i); });
  const col = (...names: string[]) => {
    for (const n of names) {
      const hit = [...cols.entries()].find(([k]) => k.startsWith(norm(n)));
      if (hit) return hit[1];
    }
    return -1;
  };
  return { idx, col };
}

export function importSpreadsheet(buffer: ArrayBuffer | Uint8Array): ImportReport {
  const wb = XLSX.read(buffer, { type: 'array' });
  const data = emptyDataset();
  const warnings: string[] = [];
  const now = Date.now();
  let seq = 0;
  const id = (p: string) => `${p}-${now.toString(36)}-${(seq++).toString(36)}`;

  data.cards = defaultCards();
  data.categories = defaultCategories();
  data.people = defaultPeople();

  const cardId = (name: string): string | undefined => {
    if (!name) return undefined;
    const hit = data.cards.find((c) => norm(c.name) === norm(name));
    if (hit) return hit.id;
    const c = { id: idFromName('card', name), name, color: PALETTE[data.cards.length % PALETTE.length], order: data.cards.length };
    data.cards.push(c);
    warnings.push(`Cartão "${name}" não existia e foi criado.`);
    return c.id;
  };
  const categoryId = (name: string): string => {
    const n = name || 'Outros';
    const hit = data.categories.find((c) => norm(c.name) === norm(n));
    if (hit) return hit.id;
    const c = { id: idFromName('cat', n), name: n, icon: '🏷️', color: PALETTE[data.categories.length % PALETTE.length], order: data.categories.length };
    data.categories.push(c);
    warnings.push(`Categoria "${n}" não existia e foi criada.`);
    return c.id;
  };
  const personId = (name: string): string => {
    if (!name || norm(name) === 'eu') return ME;
    const hit = data.people.find((p) => norm(p.name) === norm(name));
    if (hit) return hit.id;
    const p = { id: idFromName('p', name), name, order: data.people.length };
    data.people.push(p);
    warnings.push(`Pessoa "${name}" não existia e foi criada.`);
    return p.id;
  };
  const makeSplit = (amount: number, myShareRaw: unknown, restName: string, usedBy: string, where: string): Split | undefined => {
    const my = num(myShareRaw);
    if (my === null || str(myShareRaw) === '') return undefined;
    let rest = personId(restName);
    if (rest === ME) {
      if (usedBy !== ME) rest = usedBy;
      else if (toCents(amount) !== toCents(my)) {
        warnings.push(`${where}: tem "minha parte" mas não diz quem paga o resto — o resto ficou como "?" para você corrigir.`);
        rest = '?';
      }
    }
    return { myShare: toCents(my), restPersonId: rest };
  };

  // ---------- Histórico Anual: lista de meses, renda e guardado ----------
  const hist = rows(wb, 'Histórico Anual');
  const hh = header(hist, 'Mês');
  const allMonths: Month[] = [];
  if (hh.idx >= 0) {
    const cRenda = hh.col('renda');
    const cGuard = hh.col('guardado');
    for (const r of hist.slice(hh.idx + 1)) {
      const m = parseMonthLabel(str(r[0]));
      if (!m) continue;
      allMonths.push(m);
      const renda = num(r[cRenda]);
      if (renda !== null) {
        const last = data.salaries[data.salaries.length - 1];
        if (!last || last.amount !== toCents(renda)) {
          data.salaries.push({ id: id('sal'), fromMonth: m, amount: toCents(renda) } satisfies SalaryChange);
        }
      }
      const g = num(r[cGuard]);
      if (g) data.savings.push({ month: m, amount: toCents(g) });
    }
  }
  const firstMonth = allMonths[0] ?? makeMonth(new Date().getFullYear(), 1);

  // ---------- Lançamentos (cartão) ----------
  const lanc = rows(wb, 'Lançamentos');
  const lh = header(lanc, 'Quem usou');
  if (lh.idx >= 0) {
    const c = {
      mes: lh.col('mes'), data: lh.col('data'), cartao: lh.col('cartao'), desc: lh.col('descricao'),
      cat: lh.col('categoria'), quem: lh.col('quem usou'), valor: lh.col('valor (r$)', 'valor'),
      parcelas: lh.col('total parcelas'), minha: lh.col('minha parte'), resto: lh.col('quem paga o resto'),
    };
    lanc.slice(lh.idx + 1).forEach((r, i) => {
      const desc = str(r[c.desc]);
      const valor = num(r[c.valor]);
      if (!desc || valor === null) return;
      const where = `Lançamentos linha ${lh.idx + 2 + i} ("${desc}")`;
      const month = parseMonthLabel(str(r[c.mes]));
      if (!month) { warnings.push(`${where}: mês inválido, ignorado.`); return; }
      if ((num(r[c.parcelas]) ?? 0) > 1) warnings.push(`${where}: tinha "total parcelas" preenchido; foi importado como compra única.`);
      const serial = num(r[c.data]);
      const usedBy = personId(str(r[c.quem]));
      data.transactions.push({
        id: id('tx'), kind: 'card', month,
        date: serial ? excelSerialToISO(serial) : `${month}-01`,
        cardId: cardId(str(r[c.cartao])), description: desc, categoryId: categoryId(str(r[c.cat])),
        amount: toCents(valor), usedBy, split: makeSplit(valor, r[c.minha], str(r[c.resto]), usedBy, where),
        createdAt: now,
      });
    });
  }

  // ---------- Gastos Pix ----------
  const pix = rows(wb, 'Gastos Pix');
  const ph = header(pix, 'Descrição');
  if (ph.idx >= 0) {
    const c = { mes: ph.col('mes'), data: ph.col('data'), desc: ph.col('descricao'), cat: ph.col('categoria'), valor: ph.col('valor') };
    for (const r of pix.slice(ph.idx + 1)) {
      const desc = str(r[c.desc]);
      const valor = num(r[c.valor]);
      const month = parseMonthLabel(str(r[c.mes]));
      if (!desc || valor === null || !month) continue;
      const serial = num(r[c.data]);
      data.transactions.push({
        id: id('tx'), kind: 'pix', month, date: serial ? excelSerialToISO(serial) : `${month}-01`,
        description: desc, categoryId: categoryId(str(r[c.cat])), amount: toCents(valor), usedBy: ME, createdAt: now,
      });
    }
  }

  // ---------- Parcelamentos ----------
  const parc = rows(wb, 'Parcelamentos');
  const pah = header(parc, 'Nº parcelas');
  if (pah.idx >= 0) {
    const c = {
      desc: pah.col('descricao'), cartao: pah.col('cartao'), cat: pah.col('categoria'), quem: pah.col('quem usou'),
      total: pah.col('valor total'), n: pah.col('nº parcelas', 'n'), mes: pah.col('mes inicial'), ano: pah.col('ano inicial'),
    };
    for (const r of parc.slice(pah.idx + 1)) {
      const desc = str(r[c.desc]);
      const total = num(r[c.total]);
      const n = num(r[c.n]);
      if (!desc || !total || !n) continue;
      const start = parseMonthLabel(str(r[c.mes]), num(r[c.ano]) ?? undefined);
      if (!start) { warnings.push(`Parcelamento "${desc}": mês/ano inicial inválido, ignorado.`); continue; }
      data.installments.push({
        id: id('inst'), description: desc, cardId: cardId(str(r[c.cartao])) ?? data.cards[0].id,
        categoryId: categoryId(str(r[c.cat])), usedBy: personId(str(r[c.quem])),
        total: toCents(total), count: Math.round(n), startMonth: start, createdAt: now,
      });
    }
  }

  // ---------- Fixos e Boletos ----------
  const fix = rows(wb, 'Fixos e Boletos');
  const fh = header(fix, 'Forma pgto');
  if (fh.idx >= 0) {
    const c = {
      desc: fh.col('descricao'), tipo: fh.col('tipo'), forma: fh.col('forma'), cartao: fh.col('cartao'),
      cat: fh.col('categoria'), valor: fh.col('valor'), dia: fh.col('dia'), ativo: fh.col('ativo'),
      minha: fh.col('minha parte'), resto: fh.col('quem paga o resto'), skip: fh.col('meses que nao paga'),
    };
    for (const r of fix.slice(fh.idx + 1)) {
      const desc = str(r[c.desc]);
      const valor = num(r[c.valor]);
      if (!desc || valor === null) continue;
      if (norm(str(r[c.ativo])) === 'nao') {
        warnings.push(`Fixo "${desc}" estava inativo e não foi importado.`);
        continue;
      }
      const skipMonths = str(r[c.skip]).split(/[,;]/).map((s) => parseMonthLabel(s.trim())).filter((m): m is Month => !!m);
      data.recurring.push({
        id: id('rec'), description: desc,
        type: (str(r[c.tipo]) || 'Fixo/Mensal') as RecurringType,
        payMethod: (str(r[c.forma]) || 'Boleto') as PayMethod,
        cardId: cardId(str(r[c.cartao])), categoryId: categoryId(str(r[c.cat])),
        amount: toCents(valor), dueDay: num(r[c.dia]) ?? 1, startMonth: firstMonth,
        skipMonths, split: makeSplit(valor, r[c.minha], str(r[c.resto]), ME, `Fixo "${desc}"`), createdAt: now,
      });
    }
  }

  // ---------- Terceiros: "Eu devo enviar" e "Vai me passar por fora" por mês ----------
  const ter = rows(wb, 'Terceiros');
  const th = header(ter, 'Pessoa');
  if (th.idx >= 0) {
    // Linha de cabeçalho tem: ... "Mês", pessoas (eu devo enviar) ..., "Mês", pessoas (por fora) ...
    const hdr = ter[th.idx].map(str);
    const mesCols = hdr.map((h, i) => (norm(h) === 'mes' ? i : -1)).filter((i) => i >= 0);
    const blocks: { start: number; dir: 'iOwe' | 'paysMe' }[] = [];
    if (mesCols[0] !== undefined) blocks.push({ start: mesCols[0], dir: 'iOwe' });
    if (mesCols[1] !== undefined) blocks.push({ start: mesCols[1], dir: 'paysMe' });
    for (const b of blocks) {
      const people: { col: number; pid: string }[] = [];
      for (let col = b.start + 1; col < hdr.length && hdr[col] && norm(hdr[col]) !== 'mes'; col++) {
        people.push({ col, pid: personId(hdr[col]) });
      }
      for (const r of ter.slice(th.idx + 1)) {
        const m = parseMonthLabel(str(r[b.start]));
        if (!m) continue;
        for (const p of people) {
          const v = num(r[p.col]);
          if (v) data.settlements.push({ id: id('set'), month: m, personId: p.pid, direction: b.dir, amount: toCents(v), createdAt: now });
        }
      }
    }
  }

  // ---------- Meta de viagem ----------
  const res = rows(wb, 'Resumo Mensal');
  let destination = '';
  let target = 0;
  for (const r of res) {
    r.forEach((cell, i) => {
      if (norm(str(cell)) === 'destino') destination = str(r[i + 1]);
      if (norm(str(cell)).startsWith('meta (r$)')) target = num(r[i + 1]) ?? 0;
    });
  }
  if (destination || target) data.goals.push({ id: 'main', destination, target: toCents(target) });

  const counts = {
    'Compras no cartão': data.transactions.filter((t) => t.kind === 'card').length,
    'Gastos no Pix': data.transactions.filter((t) => t.kind === 'pix').length,
    Parcelamentos: data.installments.length,
    'Fixos/assinaturas': data.recurring.length,
    'Valores de terceiros': data.settlements.length,
    Pessoas: data.people.length,
    Cartões: data.cards.length,
  };
  return { data, counts, warnings };
}
