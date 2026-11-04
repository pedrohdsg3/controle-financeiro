import { AlertTriangle, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ME } from '../db/types';
import { cashView } from '../engine/bills';
import { reserveUntil, summarizeMonth, type Line } from '../engine/engine';
import { fmt } from '../lib/money';
import { monthLabel, todayISO, type Month } from '../lib/months';
import { Avatar, Glyph } from './icons';
import { Money, MonthPicker, Sheet, useData, useLookups } from './common';
import { SavingSheet } from './HistoryScreen';

interface Drill { title: string; lines: Line[]; field: 'amount' | 'mine' | 'others' }

export function SummaryScreen({ month, setMonth }: { month: Month; setMonth: (m: Month) => void }) {
  const data = useData();
  const { card, category, personName } = useLookups(data);
  const s = useMemo(() => summarizeMonth(data, month), [data, month]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [savingOpen, setSavingOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const cash = useMemo(() => cashView(data, month, todayISO()), [data, month]);

  const goal = data.goals[0];
  const reserve = reserveUntil(data, month);
  const pct = goal?.target ? Math.min(1, reserve / goal.target) : 0;
  const totalCat = s.byCategory.reduce((a, c) => a + c.mine, 0);
  const maxCard = Math.max(1, ...s.cards.map((c) => c.total));
  const pixLines = s.lines.filter((l) => l.source === 'pix');

  const flow = (label: string, value: number, opts: { sign?: '+' | '-'; cls?: string; onClick?: () => void; sub?: boolean } = {}) => (
    <div className={`line ${opts.sub ? 'sub' : ''} ${opts.cls ?? ''}`} onClick={opts.onClick} style={opts.onClick ? { cursor: 'pointer' } : undefined}>
      <span>{opts.sign === '-' ? '(−) ' : opts.sign === '+' ? '(+) ' : ''}{label}{opts.onClick ? ' ›' : ''}</span>
      <span className="num">{fmt(value)}</span>
    </div>
  );

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />

      <div className="card">
        <h2>Saldo previsto do mês</h2>
        <div className={s.freeBalance < 0 ? 'neg' : 'pos'}><Money value={s.freeBalance} className="money-xl" /></div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Considera que todo mundo vai te pagar o combinado.
        </p>
        <button className="between" style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--border)', marginTop: 10, padding: '10px 0 0' }} onClick={() => setCashOpen(true)}>
          <span className="row" style={{ gap: 6 }}><Wallet size={15} aria-hidden /> Em caixa neste mês ›</span>
          <strong className={`num ${cash.cash < 0 ? 'neg' : 'pos'}`}>{fmt(cash.cash)}</strong>
        </button>
        <div className="between" style={{ marginTop: 6 }}>
          <span className="row" style={{ gap: 6 }}><AlertTriangle size={15} aria-hidden /> Se ninguém mais me pagar</span>
          <strong className={`num ${cash.ifNoOnePays < 0 ? 'neg' : 'pos'}`}>{fmt(cash.ifNoOnePays)}</strong>
        </div>
      </div>

      <div className="card flow">
        <h2>Renda</h2>
        {flow('Salário', s.salary)}
        {flow('Outras receitas', s.otherIncome, { sign: '+' })}
        {flow('Terceiros por fora (combinado)', s.incomeFromOthers, { sign: '+' })}
        {flow('Total renda', s.totalIncome, { cls: 'total' })}
      </div>

      <div className="card">
        <h2>Faturas e contas</h2>
        <div className="list">
          {s.cards.map((c) => {
            const info = c.cardId ? card(c.cardId) : null;
            const name = info?.name ?? 'Fixos/Boletos (não-cartão)';
            return (
              <button key={c.cardId ?? 'none'} className="item" onClick={() => setDrill({ title: name, lines: c.lines, field: 'amount' })}>
                <div className="grow">
                  <div className="between">
                    <strong className="ellipsis row" style={{ gap: 6 }}><Glyph e={info ? '💳' : '🧾'} /> {name}</strong>
                    <strong className="num">{fmt(c.total)}</strong>
                  </div>
                  <div className="stack" style={{ width: `${(c.total / maxCard) * 100}%`, gap: 2, background: 'transparent' }}
                    title={`Meu ${fmt(c.mine)} · Terceiros ${fmt(c.others)}`}>
                    {c.mine > 0 && <div style={{ flex: c.mine, background: 'var(--series-1)', borderRadius: 4 }} />}
                    {c.others > 0 && <div style={{ flex: c.others, background: 'var(--series-2)', borderRadius: 4 }} />}
                  </div>
                  <div className="between small muted" style={{ marginTop: 4 }}>
                    <span>meu {fmt(c.mine)}</span>
                    <span>terceiros {fmt(c.others)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--series-1)' }} />Meu</span>
          <span><i style={{ background: 'var(--series-2)' }} />Terceiros</span>
        </div>
      </div>

      <div className="card flow">
        <h2>Do total ao saldo</h2>
        {flow('Total gastos (faturas)', s.totalBills, { onClick: () => setDrill({ title: 'Todas as faturas e contas', lines: s.lines.filter((l) => l.source !== 'pix'), field: 'amount' }) })}
        {flow('A receber de terceiros', s.toReceive, { sign: '-', sub: true, onClick: () => setDrill({ title: 'Parte de terceiros', lines: s.lines.filter((l) => l.source !== 'pix' && l.amount !== l.mine), field: 'others' }) })}
        {flow('Total gastos (meu)', s.totalMine, { cls: 'total', onClick: () => setDrill({ title: 'Meus gastos', lines: s.lines.filter((l) => l.source !== 'pix' && l.mine), field: 'mine' }) })}
        {flow('Guardado / poupança', s.saved, { sign: '-', onClick: () => setSavingOpen(true) })}
        {flow('Gastos no Pix', s.pixMine, { sign: '-', onClick: pixLines.length ? () => setDrill({ title: 'Gastos no Pix', lines: pixLines, field: 'mine' }) : undefined })}
        {flow('Enviar para terceiros (combinado)', s.sentToOthers, { sign: '-' })}
        {flow('Saldo previsto', s.freeBalance, { cls: `total ${s.freeBalance < 0 ? 'neg' : 'pos'}` })}
      </div>

      <div className="card">
        <h2>Meus gastos por categoria</h2>
        {totalCat === 0 ? <p className="muted small">Sem gastos neste mês.</p> : (
          <>
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={s.byCategory.map((c) => ({ name: category(c.categoryId)?.name ?? 'Sem categoria', value: c.mine / 100, color: category(c.categoryId)?.color ?? '#94a3b8' }))}
                    dataKey="value" innerRadius={55} outerRadius={90} paddingAngle={1} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                    {s.byCategory.map((c) => <Cell key={c.categoryId} fill={category(c.categoryId)?.color ?? '#94a3b8'} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(Math.round(v * 100))}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="list">
              {s.byCategory.map((c) => {
                const cat = category(c.categoryId);
                return (
                  <button key={c.categoryId} className="item" onClick={() => setDrill({ title: cat?.name ?? 'Sem categoria', lines: s.lines.filter((l) => (l.categoryId ?? 'sem-categoria') === c.categoryId && l.mine), field: 'mine' })}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: cat?.color, display: 'block', flex: 'none' }} />
                    <span className="grow row" style={{ gap: 6 }}><Glyph e={cat?.icon} color={cat?.color} /> {cat?.name ?? 'Sem categoria'}</span>
                    <span className="small muted">{Math.round((c.mine / totalCat) * 100)}%</span>
                    <span className="num" style={{ minWidth: 92, textAlign: 'right' }}>{fmt(c.mine)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {goal && (
        <div className="card">
          <h2>Meta de viagem</h2>
          <div className="between"><strong>{goal.destination || 'Viagem'}</strong><span className="num">{fmt(goal.target)}</span></div>
          <div className="bar" style={{ margin: '10px 0 6px' }}><div style={{ width: `${pct * 100}%` }} /></div>
          <div className="between small muted">
            <span>Guardado {fmt(reserve)} ({Math.round(pct * 100)}%)</span>
            <span>Falta {fmt(Math.max(0, goal.target - reserve))}</span>
          </div>
        </div>
      )}

      {s.people.some((p) => p.net !== 0) && (
        <div className="card">
          <h2>Terceiros em {monthLabel(month)}</h2>
          <div className="list">
            {s.people.filter((p) => p.net !== 0 || p.subtotal !== 0).sort((a, b) => b.net - a.net).map((p) => (
              <div key={p.personId} className="item">
                <span className="grow">{personName(p.personId)}</span>
                <span className={`num ${p.net < 0 ? 'neg' : ''}`}>{p.net < 0 ? `eu devo ${fmt(-p.net)}` : `me deve ${fmt(p.net)}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {cashOpen && (
        <Sheet title={`Em caixa · ${monthLabel(month)}`} onClose={() => setCashOpen(false)}>
          <div className="flow">
            <p className="small muted" style={{ marginTop: 0 }}>Só o que de fato entrou e saiu. Faturas contam quando você registra o pagamento na aba Cartões.</p>
            {flow('Salário', cash.inflow.salary)}
            {flow('Outras receitas', cash.inflow.otherIncome)}
            {flow('Terceiros me pagaram', cash.inflow.received, { sign: '+' })}
            {flow('Recebido por fora', cash.inflow.receivedOutside, { sign: '+' })}
            {flow('Total que entrou', cash.inflow.total, { cls: 'total' })}
            {flow('Faturas pagas', cash.outflow.cardsPaid, { sign: '-' })}
            {flow('Fixos/boletos fora do cartão', cash.outflow.nonCard, { sign: '-' })}
            {flow('Pix/dinheiro', cash.outflow.pix, { sign: '-' })}
            {flow('Guardado', cash.outflow.saved, { sign: '-' })}
            {flow('Enviado a terceiros', cash.outflow.sent, { sign: '-' })}
            {flow('Em caixa', cash.cash, { cls: `total ${cash.cash < 0 ? 'neg' : 'pos'}` })}
            <p className="small muted" style={{ marginBottom: 0 }}>Salário, receitas e fixos fora do cartão são considerados recebidos e pagos no mês; o app não tem como confirmar isso.</p>
          </div>
        </Sheet>
      )}
      {savingOpen && <SavingSheet month={month} onClose={() => setSavingOpen(false)} />}

      {drill && (
        <Sheet title={drill.title} onClose={() => setDrill(null)}>
          <div className="list">
            {drill.lines.length === 0 && <p className="muted">Nada aqui.</p>}
            {[...drill.lines].sort((a, b) => b.amount - a.amount).map((l, i) => {
              const cat = category(l.categoryId);
              const v = drill.field === 'amount' ? l.amount : drill.field === 'mine' ? l.mine : l.amount - l.mine;
              const others = Object.entries(l.others);
              return (
                <div key={i} className="item">
                  <Avatar icon={l.source === 'recurring' ? '🔁' : l.source === 'installment' ? '📆' : cat?.icon ?? '🏷️'} color={cat?.color} />
                  <div className="grow">
                    <div className="ellipsis">{l.description}</div>
                    <div className="small muted ellipsis">
                      {[l.detail, l.cardId ? card(l.cardId)?.name : null,
                        ...others.map(([pid, val]) => `${pid === ME ? 'Eu' : personName(pid)} ${fmt(val)}`)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="num">{fmt(v)}</span>
                </div>
              );
            })}
          </div>
          <div className="between" style={{ marginTop: 10, fontWeight: 700 }}>
            <span>Total</span>
            <span className="num">{fmt(drill.lines.reduce((a, l) => a + (drill.field === 'amount' ? l.amount : drill.field === 'mine' ? l.mine : l.amount - l.mine), 0))}</span>
          </div>
        </Sheet>
      )}
    </>
  );
}
