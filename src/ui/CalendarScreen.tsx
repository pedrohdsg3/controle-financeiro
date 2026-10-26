import { useMemo, useState } from 'react';
import { ME, type Transaction } from '../db/types';
import { dayTotals, recurringActiveIn, txLine } from '../engine/engine';
import { fmt, fmtShort } from '../lib/money';
import { daysInMonth, monthLabel, monthOf, todayISO, weekdayOfFirst, type ISODate, type Month } from '../lib/months';
import { Avatar, MonthPicker, useData, useLookups } from './common';

const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

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
  const sel = monthOf(selected) === month ? selected : `${month}-01`;

  const nDays = daysInMonth(month);
  const totals = useMemo(() => dayTotals(data, `${month}-01`, `${month}-${String(nDays).padStart(2, '0')}`), [data, month, nDays]);
  const monthSpent = [...totals.values()].reduce((a, t) => a + t.spentMine, 0);
  const monthIncome = [...totals.values()].reduce((a, t) => a + t.income, 0);

  const dayTx = data.transactions.filter((t) => t.date === sel).sort((a, b) => b.createdAt - a.createdAt);
  const dueToday = data.recurring.filter((r) => recurringActiveIn(r, month) && r.dueDay === Number(sel.slice(8)));

  const cells: (ISODate | null)[] = [
    ...Array.from({ length: weekdayOfFirst(month) }, () => null),
    ...Array.from({ length: nDays }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  return (
    <>
      <MonthPicker month={month} onChange={(m) => { setMonth(m); setSelected(`${m}-01`); }} />

      {data.transactions.length === 0 && data.installments.length === 0 && (
        <div className="hint">
          👋 Primeira vez aqui? Traga seus dados da planilha em <button className="chip" onClick={goToBackup}>Mais → Backup</button>
        </div>
      )}

      <div className="card">
        <div className="between small">
          <span className="muted">Gasto meu (pela data da compra)</span>
          <strong className="num neg">{fmt(monthSpent)}</strong>
        </div>
        {monthIncome > 0 && (
          <div className="between small" style={{ marginTop: 4 }}>
            <span className="muted">Receitas lançadas</span>
            <strong className="num pos">{fmt(monthIncome)}</strong>
          </div>
        )}
      </div>

      <div className="cal" role="grid" aria-label={`Calendário de ${monthLabel(month)}`}>
        {DOW.map((d, i) => <div key={i} className="dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="day empty" />;
          const t = totals.get(d);
          const cls = ['day', d === today ? 'today' : '', d === sel ? 'selected' : ''].join(' ');
          return (
            <button key={d} className={cls} onClick={() => (d === sel ? onAdd(d) : setSelected(d))} aria-label={`Dia ${Number(d.slice(8))}`}>
              <span className="n">{Number(d.slice(8))}</span>
              {t && t.spentMine > 0 && <span className="v">{fmtShort(t.spentMine)}</span>}
              {t && t.income > 0 && <span className="in">+{fmtShort(t.income)}</span>}
              {t && t.cats.size > 0 && (
                <span className="dots">{[...t.cats].slice(0, 4).map((c) => <i key={c} style={{ background: category(c)?.color }} />)}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>Toque num dia para ver · toque de novo para lançar</p>

      <div className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>{new Date(sel + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <button className="btn small" onClick={() => onAdd(sel)}>+ Lançar</button>
        </div>
        {dayTx.length === 0 && dueToday.length === 0 && <p className="muted small">Nada lançado neste dia.</p>}
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
                    {t.kind === 'card' ? `💳 ${card(t.cardId)?.name ?? '?'} · fatura ${monthLabel(t.month)}` : t.kind === 'pix' ? '⚡ Pix/dinheiro' : `Receita de ${monthLabel(t.month)}`}
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
          {dueToday.map((r) => (
            <div key={r.id} className="item">
              <Avatar icon="🔁" color={category(r.categoryId)?.color} />
              <div className="grow">
                <div className="ellipsis">{r.description}</div>
                <div className="small muted">Vence hoje · {r.cardId ? `no ${card(r.cardId)?.name}` : r.payMethod}</div>
              </div>
              <div className="num muted">{fmt(r.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
