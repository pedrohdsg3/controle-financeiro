import { useMemo, useState } from 'react';
import { deleteSettlement, saveSettlement } from '../db/actions';
import type { Settlement } from '../db/types';
import { summarizeMonth, UNASSIGNED, type PersonTotals } from '../engine/engine';
import { fmt, parseMoney } from '../lib/money';
import { monthLabel, type Month } from '../lib/months';
import { MonthPicker, Sheet, useData, useLookups } from './common';
import { centsToText, LineRow, PersonChips } from './pickers';

type Dir = Settlement['direction'];
const DIR_LABEL: Record<Dir, string> = { paysMe: 'Vai me passar por fora', iOwe: 'Eu devo enviar' };
const DIR_HINT: Record<Dir, string> = {
  paysMe: 'Dinheiro que a pessoa vai te pagar direto (Pix/dinheiro), fora do cartão. Entra como receita extra no mês.',
  iOwe: 'A pessoa pagou algo por você (ex: no cartão dela) e você precisa mandar esse valor. Sai do seu saldo do mês.',
};

function SettlementForm({ month, initial, onClose }: { month: Month; initial: Partial<Settlement> & { direction: Dir }; onClose: () => void }) {
  const [personId, setPersonId] = useState(initial.personId ?? '');
  const [amountText, setAmountText] = useState(centsToText(initial.amount));
  const [note, setNote] = useState(initial.note ?? '');
  const [m, setM] = useState<Month>(initial.month ?? month);
  const [err, setErr] = useState('');
  const save = async () => {
    const amount = parseMoney(amountText);
    if (!personId) return setErr('Escolha a pessoa.');
    if (!amount || amount <= 0) return setErr('Digite o valor.');
    await saveSettlement({ id: initial.id, createdAt: initial.createdAt, month: m, personId, direction: initial.direction, amount, note: note.trim() || undefined });
    onClose();
  };
  return (
    <Sheet title={DIR_LABEL[initial.direction]} onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>{DIR_HINT[initial.direction]}</p>
      <div className="field"><span className="label">Pessoa</span><PersonChips value={personId} onChange={setPersonId} /></div>
      <div className="field"><label>Valor (R$)</label>
        <input className="input" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} autoFocus placeholder="0,00" />
      </div>
      <div className="row">
        <div className="field grow"><label>Mês</label>
          <input className="input" type="month" value={m} onChange={(e) => e.target.value && setM(e.target.value)} />
        </div>
        <div className="field grow"><label>Observação</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      {err && <p className="neg small">{err}</p>}
      <div className="row">
        {initial.id && <button className="btn danger small" onClick={async () => { if (confirm('Apagar?')) { await deleteSettlement(initial.id!); onClose(); } }}>Apagar</button>}
        <button className="btn" onClick={save}>Salvar</button>
      </div>
    </Sheet>
  );
}

export function PeopleScreen({ month, setMonth }: { month: Month; setMonth: (m: Month) => void }) {
  const data = useData();
  const { card, personName } = useLookups(data);
  const s = useMemo(() => summarizeMonth(data, month), [data, month]);
  const [form, setForm] = useState<(Partial<Settlement> & { direction: Dir }) | null>(null);
  const [detail, setDetail] = useState<PersonTotals | null>(null);
  const [showIdle, setShowIdle] = useState(false);

  const active = s.people.filter((p) => p.subtotal || p.paysMe || p.iOwe).sort((a, b) => b.net - a.net);
  const idle = s.people.filter((p) => !active.includes(p) && p.personId !== UNASSIGNED && !data.people.find((x) => x.id === p.personId)?.archived);
  const unassigned = s.people.find((p) => p.personId === UNASSIGNED && p.subtotal);
  const settlements = data.settlements.filter((x) => x.month === month);
  const sum = (f: (p: PersonTotals) => number) => active.reduce((a, p) => a + f(p), 0);

  const row = (label: string, v: number, cls = '') => v ? (
    <div key={label} className={`between small ${cls}`} style={{ padding: '3px 0' }}><span className="muted">{label}</span><span className="num">{fmt(v)}</span></div>
  ) : null;

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />
      <div className="hint">
        Aqui aparece o que cada pessoa gastou nos seus cartões (compras, parcelas e a parte dela nas divisões) e o que vocês combinaram por fora. <strong>Saldo positivo = ela te deve.</strong>
      </div>

      <div className="card">
        <h2>Total em {monthLabel(month)}</h2>
        <div className="between"><span>Gastos de terceiros</span><strong className="num">{fmt(sum((p) => p.subtotal))}</strong></div>
        {sum((p) => p.paysMe) > 0 && <div className="between small"><span className="muted">(+) Vão me passar por fora</span><span className="num">{fmt(sum((p) => p.paysMe))}</span></div>}
        {sum((p) => p.iOwe) > 0 && <div className="between small"><span className="muted">(−) Eu devo enviar</span><span className="num">{fmt(sum((p) => p.iOwe))}</span></div>}
        <div className="between" style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
          <strong>Saldo líquido</strong><strong className="num">{fmt(sum((p) => p.net))}</strong>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Bate com o “A receber de terceiros” do Resumo ({fmt(s.toReceive)}) + a parte de terceiros em Pix.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small secondary grow" onClick={() => setForm({ direction: 'paysMe' })}>+ Por fora</button>
          <button className="btn small secondary grow" onClick={() => setForm({ direction: 'iOwe' })}>+ Devo enviar</button>
        </div>
      </div>

      {unassigned && (
        <div className="card warn small">⚠️ {fmt(unassigned.subtotal)} de gastos divididos estão sem “quem paga o resto”. Abra o lançamento e escolha a pessoa.</div>
      )}

      {active.length === 0 && <div className="card empty-state"><div className="ico">🤝</div><p>Ninguém usou seus cartões neste mês.</p></div>}

      {active.map((p) => (
        <div key={p.personId} className="card">
          <div className="between">
            <strong style={{ fontSize: 17 }}>{personName(p.personId)}</strong>
            <span className={`num ${p.net < 0 ? 'neg' : 'pos'}`} style={{ fontWeight: 700, fontSize: 17 }}>
              {p.net < 0 ? `eu devo ${fmt(-p.net)}` : `me deve ${fmt(p.net)}`}
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            {Object.entries(p.byCard).map(([cid, v]) => row(`💳 ${cid === 'none' ? 'Sem cartão' : card(cid)?.name ?? '?'}`, v))}
            {row('🔁 Assinaturas / fixos divididos', p.recurring)}
            {row('⚡ Pix divididos', p.pix)}
            {row('(+) Vai me passar por fora', p.paysMe, 'pos')}
            {row('(−) Eu devo enviar', p.iOwe, 'neg')}
          </div>
          {settlements.filter((x) => x.personId === p.personId).map((x) => (
            <button key={x.id} className="badge" style={{ marginRight: 6, marginTop: 6, border: 0 }} onClick={() => setForm(x)}>
              ✏️ {DIR_LABEL[x.direction]}: {fmt(x.amount)}{x.note ? ` · ${x.note}` : ''}
            </button>
          ))}
          <div className="row" style={{ marginTop: 10 }}>
            {p.subtotal !== 0 && <button className="btn small secondary" onClick={() => setDetail(p)}>Ver itens</button>}
            <button className="btn small secondary" onClick={() => setForm({ direction: 'paysMe', personId: p.personId })}>+ Por fora</button>
            <button className="btn small secondary" onClick={() => setForm({ direction: 'iOwe', personId: p.personId })}>+ Devo enviar</button>
          </div>
        </div>
      ))}

      {idle.length > 0 && (
        <div className="card">
          <button className="between" style={{ width: '100%', background: 'none', border: 0, padding: 0 }} onClick={() => setShowIdle(!showIdle)}>
            <h2 style={{ margin: 0 }}>Sem movimento neste mês ({idle.length})</h2><span className="muted">{showIdle ? '▴' : '▾'}</span>
          </button>
          {showIdle && <div className="chips" style={{ marginTop: 10 }}>{idle.map((p) => <span key={p.personId} className="chip">{personName(p.personId)}</span>)}</div>}
        </div>
      )}

      {form && <SettlementForm month={month} initial={form} onClose={() => setForm(null)} />}
      {detail && (
        <Sheet title={`${personName(detail.personId)} · ${monthLabel(month)}`} onClose={() => setDetail(null)}>
          <div className="list">
            {s.lines.filter((l) => l.others[detail.personId]).sort((a, b) => b.others[detail.personId] - a.others[detail.personId])
              .map((l, i) => <LineRow key={i} line={l} value={l.others[detail.personId]} showPeople={false} />)}
          </div>
          <div className="between" style={{ marginTop: 10, fontWeight: 700 }}><span>Total</span><span className="num">{fmt(detail.subtotal)}</span></div>
        </Sheet>
      )}
    </>
  );
}
