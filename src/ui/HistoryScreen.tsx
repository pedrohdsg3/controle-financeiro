import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { setSaving } from '../db/actions';
import { ME, type Dataset } from '../db/types';
import { dataMonthRange, history, reserveUntil, type HistoryRow } from '../engine/engine';
import { fmt, fmtShort, parseMoney } from '../lib/money';
import { addMonths, currentMonth, monthLabel, monthLabelShort, type Month } from '../lib/months';
import { Sheet, useData } from './common';
import { CardChips, centsToText } from './pickers';

const BLUE = '#2a78d6';
const ORANGE = '#eb6834';
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13 };

/** Editar quanto foi guardado no mês (usado no Histórico e no Resumo). */
export function SavingSheet({ month, onClose }: { month: Month; onClose: () => void }) {
  const data = useData();
  const [text, setText] = useState(centsToText(data.savings.find((s) => s.month === month)?.amount ?? 0));
  return (
    <Sheet title={`Guardado em ${monthLabel(month)}`} onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>Quanto você separou para a poupança/viagem neste mês. Sai do saldo livre e soma na reserva acumulada.</p>
      <input className="input" inputMode="decimal" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={async () => { await setSaving(month, parseMoney(text) ?? 0); onClose(); }}>Salvar</button>
      </div>
    </Sheet>
  );
}

function axisMoney(v: number) {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')}k` : String(Math.round(v));
}

/** Simula uma compra parcelada nova e mostra como ficam os saldos. */
function Simulator({ data, base, from, to }: { data: Dataset; base: HistoryRow[]; from: Month; to: Month }) {
  const now = currentMonth();
  const [totalText, setTotalText] = useState('');
  const [count, setCount] = useState(10);
  const [start, setStart] = useState<Month>(addMonths(now, 1));
  const [cardId, setCardId] = useState<string | undefined>(data.cards.find((c) => !c.archived)?.id);
  const total = parseMoney(totalText) ?? 0;

  const sim = useMemo(() => {
    if (!total || !cardId) return null;
    const fake: Dataset = {
      ...data,
      installments: [...data.installments, {
        id: 'simulacao', description: 'Simulação', cardId, categoryId: data.categories[0]?.id ?? '', usedBy: ME,
        total, count, startMonth: start, createdAt: 0,
      }],
    };
    const end = addMonths(start, count - 1);
    return history(fake, from, end > to ? end : to).filter((r) => r.month >= start && r.month <= end);
  }, [data, total, count, start, cardId, from, to]);

  return (
    <div className="card">
      <h2>🧮 E se eu parcelar?</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Veja o efeito de uma compra nova antes de fazer. Nada é salvo.</p>
      <div className="row">
        <div className="field grow"><label>Valor total</label><input className="input" inputMode="decimal" value={totalText} onChange={(e) => setTotalText(e.target.value)} placeholder="0,00" /></div>
        <div className="field" style={{ width: 80 }}><label>Vezes</label><input className="input" type="number" min={1} max={48} value={count} onChange={(e) => setCount(Math.max(1, Math.min(48, Number(e.target.value) || 1)))} /></div>
      </div>
      <div className="field"><label>1ª parcela na fatura de</label><input className="input" type="month" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} /></div>
      <div className="field"><span className="label">Cartão</span><CardChips value={cardId} onChange={setCardId} /></div>
      {sim && (
        <div className="list">
          {sim.map((r) => {
            const before = base.find((b) => b.month === r.month)?.freeBalance ?? 0;
            return (
              <div key={r.month} className="between small" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{monthLabel(r.month)}</span>
                <span className="num muted">{fmt(before)} →</span>
                <strong className={`num ${r.freeBalance < 0 ? 'neg' : 'pos'}`}>{fmt(r.freeBalance)}</strong>
              </div>
            );
          })}
          {sim.some((r) => r.freeBalance < 0) && <p className="small warn">⚠️ Em {sim.filter((r) => r.freeBalance < 0).length} mês(es) o saldo livre fica negativo.</p>}
        </div>
      )}
    </div>
  );
}

export function HistoryScreen() {
  const data = useData();
  const now = currentMonth();
  const range = dataMonthRange(data, now);
  const to = range.to > addMonths(now, 6) ? range.to : addMonths(now, 6);
  const rows = useMemo(() => history(data, range.from, to), [data, range.from, to]);
  const [editSaving, setEditSaving] = useState<Month | null>(null);
  const [onlyFrom, setOnlyFrom] = useState<'all' | 'year'>('year');

  const visible = onlyFrom === 'year' ? rows.filter((r) => r.month >= addMonths(now, -6) && r.month <= addMonths(now, 12)) : rows;
  const chart = visible.map((r) => ({
    name: monthLabelShort(r.month), month: r.month, future: r.month > now,
    saldo: r.freeBalance / 100, renda: r.income / 100, gasto: (r.totalMine + r.pixMine) / 100,
  }));

  const goal = data.goals[0];
  const reserve = reserveUntil(data, now);
  const pct = goal?.target ? Math.min(1, reserve / goal.target) : 0;
  const savedMonths = data.savings.filter((s) => s.amount > 0);
  const avg = savedMonths.length ? savedMonths.reduce((a, s) => a + s.amount, 0) / savedMonths.length : 0;
  const monthsToGoal = goal && avg > 0 ? Math.ceil(Math.max(0, goal.target - reserve) / avg) : null;

  return (
    <>
      <div className="seg">
        <button className={onlyFrom === 'year' ? 'on' : ''} onClick={() => setOnlyFrom('year')}>Últimos 6 + próximos 12</button>
        <button className={onlyFrom === 'all' ? 'on' : ''} onClick={() => setOnlyFrom('all')}>Todo o período</button>
      </div>

      <div className="card">
        <h2>Saldo livre por mês</h2>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={axisMoney} tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={44} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Tooltip formatter={(v: number) => [fmt(Math.round(v * 100)), 'Saldo']} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="saldo" radius={[4, 4, 4, 4]} isAnimationActive={false}>
                {chart.map((c) => <Cell key={c.month} fill={c.saldo < 0 ? ORANGE : BLUE} fillOpacity={c.future ? 0.5 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="legend">
          <span><i style={{ background: BLUE }} />Sobrou</span><span><i style={{ background: ORANGE }} />Faltou</span>
          <span><i style={{ background: BLUE, opacity: 0.5 }} />Meses futuros (projeção)</span>
        </div>
      </div>

      <div className="card">
        <h2>Renda × meu gasto</h2>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={axisMoney} tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={44} />
              <Tooltip formatter={(v: number, n: string) => [fmt(Math.round(v * 100)), n]} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={9} />
              <Bar dataKey="renda" name="Renda" fill={BLUE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="gasto" name="Meu gasto (cartões, fixos e Pix)" fill={ORANGE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {goal && (
        <div className="card">
          <h2>🎯 {goal.destination || 'Meta'}</h2>
          <div className="between"><span className="big num">{fmt(reserve)}</span><span className="muted num">de {fmt(goal.target)}</span></div>
          <div className="bar" style={{ margin: '10px 0 6px' }}><div style={{ width: `${pct * 100}%` }} /></div>
          <div className="between small muted"><span>{Math.round(pct * 100)}% guardado</span><span>Falta {fmt(Math.max(0, goal.target - reserve))}</span></div>
          <p className="small" style={{ marginBottom: 0 }}>
            {monthsToGoal === null ? 'Toque em “Guardado” num mês da tabela abaixo para registrar o que você separou.'
              : monthsToGoal === 0 ? '🎉 Meta atingida!'
              : `No ritmo atual (média de ${fmt(Math.round(avg))}/mês), você chega lá em ${monthLabel(addMonths(now, monthsToGoal))}.`}
          </p>
          <button className="btn small" style={{ marginTop: 10 }} onClick={() => setEditSaving(now)}>Guardar em {monthLabel(now)}</button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 style={{ padding: '14px 14px 0' }}>Mês a mês</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>Mês</th><th>Renda</th><th>Faturas</th><th>A receber</th><th>Meu gasto</th><th>Pix</th><th>Saldo</th><th>Guardado</th><th>Reserva</th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.month} className={r.month === now ? 'now' : r.month > now ? 'future' : ''}>
                  <td>{monthLabelShort(r.month)}</td>
                  <td className="num">{fmtShort(r.income)}</td>
                  <td className="num">{fmtShort(r.totalBills)}</td>
                  <td className="num">{fmtShort(r.toReceive)}</td>
                  <td className="num">{fmtShort(r.totalMine)}</td>
                  <td className="num">{fmtShort(r.pixMine)}</td>
                  <td className={`num ${r.freeBalance < 0 ? 'neg' : 'pos'}`}><strong>{fmtShort(r.freeBalance)}</strong></td>
                  <td className="num"><button className="chip" style={{ padding: '2px 8px' }} onClick={() => setEditSaving(r.month)}>{fmtShort(r.saved)} ✏️</button></td>
                  <td className="num">{fmtShort(r.reserve)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ padding: '0 14px' }}>Valores em R$ arredondados. Meses claros são projeção (parcelas e fixos já conhecidos + salário atual).</p>
      </div>

      <Simulator data={data} base={rows} from={range.from} to={to} />
      {editSaving && <SavingSheet month={editSaving} onClose={() => setEditSaving(null)} />}
    </>
  );
}
