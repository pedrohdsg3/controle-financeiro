import { useMemo, useState } from 'react';
import { addReceipt, deleteReceipt, deleteSettlement, saveSettlement } from '../db/actions';
import type { Settlement } from '../db/types';
import { allocatePayment, openDebts, openToSend, peopleLedger, type PersonLedger } from '../engine/bills';
import { summarizeMonth, UNASSIGNED } from '../engine/engine';
import { fmt, parseMoney } from '../lib/money';
import { monthLabel, monthLabelShort, shortDateBR, todayISO, type Month } from '../lib/months';
import { PaySheet, type PayForm } from './CardsScreen';
import { MonthPicker, Sheet, useData, useLookups } from './common';
import { centsToText, LineRow, PersonChips } from './pickers';

type Dir = Settlement['direction'];
const DIR_LABEL: Record<Dir, string> = { paysMe: 'Vai me passar por fora', iOwe: 'Eu devo enviar' };
const DIR_HINT: Record<Dir, string> = {
  paysMe: 'Dinheiro que a pessoa vai te pagar direto (Pix/dinheiro), além do que gastou nos cartões. Entra como receita extra no mês.',
  iOwe: 'A pessoa pagou algo por você (ex: no cartão dela) e você precisa mandar esse valor. Sai do seu saldo do mês.',
};

function SettlementForm({ month, initial, onClose }: { month: Month; initial: Partial<Settlement> & { direction: Dir }; onClose: () => void }) {
  const [personId, setPersonId] = useState(initial.personId ?? '');
  const [amountText, setAmountText] = useState(centsToText(initial.amount));
  const [note, setNote] = useState(initial.note ?? '');
  const [m, setM] = useState<Month>(initial.month ?? month);
  const [done, setDone] = useState(!!initial.doneAt);
  const [err, setErr] = useState('');
  const save = async () => {
    const amount = parseMoney(amountText);
    if (!personId) return setErr('Escolha a pessoa.');
    if (!amount) return setErr('Digite o valor.');
    await saveSettlement({ id: initial.id, createdAt: initial.createdAt, month: m, personId, direction: initial.direction, amount, note: note.trim() || undefined, doneAt: done ? initial.doneAt ?? todayISO() : undefined });
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
      <label className="toggle">
        <span>{initial.direction === 'paysMe' ? '✅ Já recebi este valor' : '✅ Já enviei este valor'}</span>
        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
      </label>
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
  const today = todayISO();
  const ledger = useMemo(() => peopleLedger(data, month, today), [data, month, today]);
  const lines = useMemo(() => summarizeMonth(data, month).lines, [data, month]);
  const debts = useMemo(() => openDebts(data, today), [data, today]);
  const toSend = useMemo(() => openToSend(data, today), [data, today]);
  const [form, setForm] = useState<(Partial<Settlement> & { direction: Dir }) | null>(null);
  const [pay, setPay] = useState<PayForm | null>(null);
  const [detail, setDetail] = useState<PersonLedger | null>(null);

  const total = (f: (p: PersonLedger) => number) => ledger.reduce((a, p) => a + f(p), 0);
  const unassigned = ledger.find((p) => p.personId === UNASSIGNED);

  const receive = (p: PersonLedger) => {
    const spendPending = p.sources.reduce((a, s) => a + s.pending, 0);
    setPay({
      title: `${personName(p.personId)} me pagou`,
      hint: `Falta ${fmt(spendPending)} dos gastos de ${monthLabel(month)}. Pode ser parcial; o valor é abatido dos cartões, na ordem. Isso não muda o saldo previsto.`,
      suggested: spendPending,
      onSave: async (amount, date, note) => {
        // Se pagar a mais, o excedente fica no último cartão: o valor real recebido nunca se perde.
        const parts = allocatePayment(p.sources, amount);
        const extra = amount - parts.reduce((a, x) => a + x.amount, 0);
        if (extra > 0 && parts.length) parts[parts.length - 1].amount += extra;
        for (const part of parts) await addReceipt({ personId: p.personId, month, cardId: part.cardId, amount: part.amount, date, note });
      },
    });
  };
  const confirmSettlement = (x: Settlement) => saveSettlement({ ...x, doneAt: todayISO() });

  const row = (label: string, v: number, cls = '') => (v ? (
    <div key={label} className={`between small ${cls}`} style={{ padding: '3px 0' }}><span className="muted">{label}</span><span className="num">{fmt(v)}</span></div>
  ) : null);

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />

      {(debts.length > 0 || toSend.length > 0) && (
        <div className="card">
          <h2>Em aberto até hoje</h2>
          <div className="list">
            {debts.map((d) => (
              <div key={d.personId} className="item" style={{ display: 'block' }}>
                <div className="between"><span>{personName(d.personId)} me deve</span><strong className="num">{fmt(d.pending)}</strong></div>
                <div className="chips" style={{ marginTop: 4 }}>
                  {d.months.map((m) => <button key={m.month} className="badge" style={{ border: 0 }} onClick={() => setMonth(m.month)}>{monthLabelShort(m.month)}: {fmt(m.pending)}</button>)}
                </div>
              </div>
            ))}
            {toSend.map((d) => (
              <div key={d.personId} className="item" style={{ display: 'block' }}>
                <div className="between"><span>Eu devo a {personName(d.personId)}</span><strong className="num neg">{fmt(d.amount)}</strong></div>
                <div className="chips" style={{ marginTop: 4 }}>
                  {d.months.map((m) => <button key={m} className="badge" style={{ border: 0 }} onClick={() => setMonth(m)}>{monthLabelShort(m)}</button>)}
                </div>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>Conta desde o início deste controle. Meses anteriores não foram registrados.</p>
        </div>
      )}

      <div className="card">
        <h2>{monthLabel(month)}</h2>
        <div className="between"><span>Terceiros devem</span><strong className="num">{fmt(total((p) => p.owes))}</strong></div>
        <div className="between small muted"><span>Já pagaram {fmt(total((p) => p.paid))}</span><span>Falta {fmt(total((p) => p.toReceive))}</span></div>
        {total((p) => p.toSend) > 0 && <div className="between small" style={{ marginTop: 4 }}><span className="muted">Eu ainda devo enviar</span><span className="num neg">{fmt(total((p) => p.toSend))}</span></div>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small secondary grow" onClick={() => setForm({ direction: 'paysMe' })}>+ Por fora</button>
          <button className="btn small secondary grow" onClick={() => setForm({ direction: 'iOwe' })}>+ Devo enviar</button>
        </div>
      </div>

      {unassigned && unassigned.spent > 0 && (
        <div className="card warn small">⚠️ {fmt(unassigned.spent)} de gastos divididos estão sem “quem paga o resto”. Corrija em Mais → Revisar lançamentos.</div>
      )}

      {ledger.length === 0 && <div className="card empty-state"><div className="ico">🤝</div><p>Nenhuma movimentação com terceiros neste mês.</p></div>}

      {ledger.filter((p) => p.personId !== UNASSIGNED).map((p) => {
        const settled = p.open === 0 && p.toReceive === 0 && p.toSend === 0;
        return (
          <div key={p.personId} className="card">
            <div className="between">
              <span className="person-head">{personName(p.personId)}</span>
              {settled
                ? <span className="badge state-ok">✅ Quitado</span>
                : <span className={`num person-head ${p.open < 0 ? 'neg' : ''}`}>{p.open < 0 ? `eu devo ${fmt(-p.open)}` : `me deve ${fmt(p.open)}`}</span>}
            </div>
            <div style={{ marginTop: 6 }}>
              {Object.entries(p.byCard).map(([cid, v]) => row(`💳 ${cid === 'none' ? 'Sem cartão' : card(cid)?.name ?? '?'}`, v))}
              {row('🔁 Assinaturas e fixos', p.recurring)}
              {row('⚡ Pix', p.pix)}
              {row('✅ Já me pagou', p.paid, 'pos')}
            </div>
            {p.settlements.map((x) => (
              <div key={x.id} className="chip-row small">
                <button style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setForm(x)}>
                  {x.doneAt
                    ? `✅ ${x.direction === 'paysMe' ? 'Recebi por fora' : 'Enviei'} ${shortDateBR(x.doneAt)}: ${fmt(x.amount)}`
                    : `⏳ ${DIR_LABEL[x.direction]}: ${fmt(x.amount)}`}
                  {x.note ? ` · ${x.note}` : ''} ✏️
                </button>
                {!x.doneAt && <button className="btn small secondary" style={{ flex: 'none' }} onClick={() => confirmSettlement(x)}>{x.direction === 'paysMe' ? 'Recebi' : 'Enviei'}</button>}
              </div>
            ))}
            {p.receipts.map((r) => (
              <button key={r.id} className="badge entry" onClick={() => confirm(`Apagar o recebimento de ${fmt(r.amount)}?`) && deleteReceipt(r.id)}>
                {shortDateBR(r.date)} · {fmt(r.amount)}{r.cardId ? ` · ${card(r.cardId)?.name ?? ''}` : ''}{r.note ? ` · ${r.note}` : ''} ✕
              </button>
            ))}
            <div className="chips" style={{ marginTop: 10 }}>
              {p.sources.length > 0 && <button className="btn small" onClick={() => receive(p)}>Recebi</button>}
              {p.spent !== 0 && <button className="btn small secondary" onClick={() => setDetail(p)}>Itens</button>}
              <button className="btn small secondary" onClick={() => setForm({ direction: 'paysMe', personId: p.personId })}>+ Por fora</button>
              <button className="btn small secondary" onClick={() => setForm({ direction: 'iOwe', personId: p.personId })}>+ Enviar</button>
            </div>
          </div>
        );
      })}

      {form && <SettlementForm month={month} initial={form} onClose={() => setForm(null)} />}
      {pay && <PaySheet form={pay} onClose={() => setPay(null)} />}
      {detail && (
        <Sheet title={`${personName(detail.personId)} · ${monthLabel(month)}`} onClose={() => setDetail(null)}>
          <div className="list">
            {lines.filter((l) => l.others[detail.personId]).sort((a, b) => b.others[detail.personId] - a.others[detail.personId])
              .map((l, i) => <LineRow key={i} line={l} value={l.others[detail.personId]} showPeople={false} />)}
          </div>
          <div className="between" style={{ marginTop: 10, fontWeight: 700 }}><span>Total</span><span className="num">{fmt(detail.spent)}</span></div>
        </Sheet>
      )}
    </>
  );
}
