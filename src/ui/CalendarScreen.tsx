import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ME, type Installment, type Transaction } from '../db/types';
import { dayTotals, recurringActiveIn, shares, txLine } from '../engine/engine';
import { fmt, fmtShort } from '../lib/money';
import { daysInMonth, monthLabel, monthOf, todayISO, weekdayOfFirst, type ISODate, type Month } from '../lib/months';
import { Avatar } from './icons';
import { Money, MonthPicker, useData, useLookups } from './common';
import { InstallmentForm } from './InstallmentsScreen';

const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Intensidade do dia em 4 níveis. A raiz evita que um único dia enorme apague todos os outros. */
export function heatLevel(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '';
  return `heat-${Math.min(4, Math.ceil(Math.sqrt(value / max) * 4))}`;
}

interface Props {
  month: Month;
  setMonth: (m: Month) => void;
  onAdd: (date: ISODate) => void;
  onEdit: (t: Transaction) => void;
  goToBackup: () => void;
}

export function CalendarScreen({ month, setMonth, onAdd, onEdit, goToBackup }: Props) {
  const data = useData();
  const { card, category, personName } = useLookups(data);
  const today = todayISO();
  const [selected, setSelected] = useState<ISODate>(monthOf(today) === month ? today : `${month}-01`);
  const [editingInst, setEditingInst] = useState<Installment | null>(null);
  const sel = monthOf(selected) === month ? selected : `${month}-01`;

  const nDays = daysInMonth(month);
  const totals = useMemo(() => dayTotals(data, `${month}-01`, `${month}-${String(nDays).padStart(2, '0')}`), [data, month, nDays]);
  const monthSpent = [...totals.values()].reduce((a, t) => a + t.spentMine, 0);
  const monthIncome = [...totals.values()].reduce((a, t) => a + t.income, 0);
  const maxDay = Math.max(0, ...[...totals.values()].map((t) => t.spentMine));
  const [showInfo, setShowInfo] = useState(false);

  const dayTx = data.transactions.filter((t) => t.date === sel).sort((a, b) => b.createdAt - a.createdAt);
  const dayInst = data.installments.filter((i) => i.purchaseDate === sel);
  const dueToday = data.recurring.filter((r) => recurringActiveIn(r, month) && Math.min(r.dueDay, nDays) === Number(sel.slice(8)));

  const cells: (ISODate | null)[] = [
    ...Array.from({ length: weekdayOfFirst(month) }, () => null),
    ...Array.from({ length: nDays }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  return (
    <>
      <MonthPicker month={month} onChange={(m) => { setMonth(m); setSelected(`${m}-01`); }} />

      {data.transactions.length === 0 && data.installments.length === 0 && (
        <div className="hint">
          Primeira vez aqui? Traga seus dados da planilha em <button className="chip" onClick={goToBackup}>Mais → Backup</button>
        </div>
      )}

      <div className="cal-summary">
        <div>
          <span className="small muted row" style={{ gap: 4 }}>
            Compras no mês
            <button className="icon-btn" style={{ padding: 2 }} aria-label="O que este valor conta" aria-expanded={showInfo} onClick={() => setShowInfo(!showInfo)}><Info size={13} /></button>
          </span>
          <Money value={monthSpent} className="money-lg" />
        </div>
        {monthIncome > 0 && (
          <div style={{ textAlign: 'right' }}>
            <span className="small muted">Receitas</span>
            <div className="pos"><Money value={monthIncome} className="money-md" /></div>
          </div>
        )}
      </div>
      {showInfo && <p className="small muted" style={{ marginTop: 0 }}>Sua parte, pela data da compra; parcelada entra com o valor total no dia dela. O quanto cai em cada fatura, com fixos e parcelas, está no Resumo.</p>}

      <div className="cal" role="grid" aria-label={`Calendário de ${monthLabel(month)}`}>
        {DOW.map((d, i) => <div key={i} className="dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="day empty" />;
          const t = totals.get(d);
          const cls = ['day', heatLevel(t?.spentMine ?? 0, maxDay), d === today ? 'today' : '', d === sel ? 'selected' : ''].join(' ');
          return (
            <button key={d} className={cls} onClick={() => (d === sel ? onAdd(d) : setSelected(d))} aria-label={`Dia ${Number(d.slice(8))}`}>
              <span className="n">{Number(d.slice(8))}</span>
              {t && t.spentMine > 0 && <span className="v">{fmtShort(t.spentMine)}</span>}
              {t && t.income > 0 && <span className="in">+{fmtShort(t.income)}</span>}
            </button>
          );
        })}
      </div>
      <div className="heat-legend small muted">
        <span>Toque para ver · de novo para lançar</span>
        <span className="row" style={{ gap: 3 }}>menos<i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><i className="heat-4" />mais</span>
      </div>

      <div className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>{new Date(sel + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <button className="btn small" onClick={() => onAdd(sel)}>+ Lançar</button>
        </div>
        {dayTx.length === 0 && dayInst.length === 0 && dueToday.length === 0 && <p className="muted small">Nada lançado neste dia.</p>}
        <div className="list">
          {dayTx.map((t) => {
            const l = txLine(t);
            const cat = category(t.categoryId);
            const others = Object.entries(l.others);
            return (
              <button key={t.id} className="item" onClick={() => onEdit(t)}>
                <Avatar icon={t.kind === 'income' ? '💰' : cat?.icon ?? '🏷️'} color={t.kind === 'income' ? '#22c55e' : cat?.color} />
                <div className="grow">
                  <div className="ellipsis">{t.description}</div>
                  <div className="small muted ellipsis">
                    {t.kind === 'card' ? `${card(t.cardId)?.name ?? '?'} · fatura ${monthLabel(t.month)}` : t.kind === 'pix' ? 'Pix/dinheiro' : `Receita de ${monthLabel(t.month)}`}
                    {t.usedBy !== ME && !t.split && ` · ${personName(t.usedBy)}`}
                    {others.length > 0 && t.split && ` · ${personName(others[0][0])} paga ${fmt(others[0][1])}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`num ${t.kind === 'income' ? 'pos' : ''}`}>{t.kind === 'income' ? '+' : ''}{fmt(t.amount)}</div>
                  {t.kind !== 'income' && l.mine !== l.amount && <div className="small muted num">meu {fmt(l.mine)}</div>}
                </div>
              </button>
            );
          })}
          {dayInst.map((i) => {
            const cat = category(i.categoryId);
            const mine = shares(i.total, i.usedBy, i.split).mine;
            return (
              <button key={i.id} className="item" onClick={() => setEditingInst(i)}>
                <Avatar icon="📆" color={cat?.color} />
                <div className="grow">
                  <div className="ellipsis">{i.description}</div>
                  <div className="small muted ellipsis">{card(i.cardId)?.name ?? '?'} · {i.count}× · 1ª em {monthLabel(i.startMonth)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num">{fmt(i.total)}</div>
                  {mine !== i.total && <div className="small muted num">meu {fmt(mine)}</div>}
                </div>
              </button>
            );
          })}
          {dueToday.map((r) => (
            <div key={r.id} className="item">
              <Avatar icon="🔁" color={category(r.categoryId)?.color} />
              <div className="grow">
                <div className="ellipsis">{r.description}</div>
                <div className="small muted">Vence neste dia · {r.cardId ? `no ${card(r.cardId)?.name}` : r.payMethod}</div>
              </div>
              <div className="num muted">{fmt(r.amount)}</div>
            </div>
          ))}
        </div>
      </div>
      {editingInst && <InstallmentForm initial={editingInst} onClose={() => setEditingInst(null)} />}
    </>
  );
}
