import { useMemo, useState } from 'react';
import { addCardPayment, addReceipt, deleteCardPayment, deleteReceipt, setCardDueDay } from '../db/actions';
import type { Card } from '../db/types';
import {
  ALERT_DAYS, calendarLink, dueAlerts, dueLabel, monthBills, openDebts, type Bill, type OpenBill, type PersonBill,
} from '../engine/bills';
import { fmt, parseMoney, type Cents } from '../lib/money';
import { monthLabel, monthLabelShort, todayISO, type ISODate, type Month } from '../lib/months';
import {
  enableNotifications, notificationPermission, notificationsSupported, registerBackgroundCheck, showTestNotification,
} from '../lib/notify';
import { MonthPicker, Sheet, useData, useLookups } from './common';
import { centsToText, LineRow } from './pickers';

const shortDate = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

interface PayForm {
  title: string;
  hint: string;
  suggested: Cents;
  onSave: (amount: Cents, date: ISODate, note?: string) => Promise<void>;
}

function PaySheet({ form, onClose }: { form: PayForm; onClose: () => void }) {
  const [text, setText] = useState(centsToText(form.suggested));
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const amount = parseMoney(text);
    if (!amount) return setErr('Digite o valor.');
    await form.onSave(amount, date, note.trim() || undefined);
    onClose();
  };
  return (
    <Sheet title={form.title} onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>{form.hint}</p>
      <div className="field"><label>Valor (R$)</label><input className="input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="row">
        <div className="field grow"><label>Data</label><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <div className="field grow"><label>Observação</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" /></div>
      </div>
      {err && <p className="neg small">{err}</p>}
      <button className="btn" onClick={save}>Confirmar</button>
    </Sheet>
  );
}

function DueSheet({ card, onClose }: { card: Card; onClose: () => void }) {
  const [text, setText] = useState(card.dueDay ? String(card.dueDay) : '');
  const [err, setErr] = useState('');
  const link = calendarLink(card, todayISO());
  const save = async () => {
    const day = Number(text);
    if (text && (!Number.isInteger(day) || day < 1 || day > 31)) return setErr('Digite um dia entre 1 e 31.');
    await setCardDueDay(card, text ? day : undefined);
    onClose();
  };
  return (
    <Sheet title={`Vencimento do ${card.name}`} onClose={onClose}>
      <div className="field">
        <label>Dia do vencimento</label>
        <input className="input" inputMode="numeric" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex: 15" />
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>A fatura de cada mês vence neste dia. Os avisos começam {ALERT_DAYS} dias antes.</p>
      {err && <p className="neg small">{err}</p>}
      <button className="btn" onClick={save}>Salvar</button>
      {link && (
        <>
          <div style={{ height: 8 }} />
          <a className="btn secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }} href={link} target="_blank" rel="noreferrer">
            📅 Criar lembrete mensal na agenda do Google
          </a>
          <p className="small muted" style={{ marginBottom: 0 }}>É o jeito mais garantido de o celular avisar. Só o nome do cartão vai para a agenda.</p>
        </>
      )}
    </Sheet>
  );
}

function DueChip({ bill }: { bill: Bill }) {
  if (bill.total > 0 && bill.remaining === 0) return <span className="badge state-ok">✅ Paga</span>;
  if (bill.days === null) return null;
  if (bill.days < 0) return <span className="badge state-bad">⚠️ {dueLabel(bill.days)}</span>;
  if (bill.days <= ALERT_DAYS) return <span className="badge state-warn">⏰ {dueLabel(bill.days)}</span>;
  return <span className="badge">vence {shortDate(bill.dueDate!)}</span>;
}

/** Aviso de faturas vencidas ou perto de vencer; aparece na tela inicial e na aba Cartões. */
export function DueBanner({ alerts, onOpen }: { alerts: OpenBill[]; onOpen: (month: Month) => void }) {
  if (!alerts.length) return null;
  return (
    <div className="card due-banner">
      {alerts.slice(0, 4).map((a) => (
        <button key={a.cardId + a.month} className="between" onClick={() => onOpen(a.month)}>
          <span className="ellipsis">{a.days < 0 ? '⚠️' : '⏰'} <strong>{a.cardName}</strong> {dueLabel(a.days)}</span>
          <span className="num">{fmt(a.remaining)} ›</span>
        </button>
      ))}
    </div>
  );
}

function NotificationsCard() {
  const supported = notificationsSupported();
  const [permission, setPermission] = useState(notificationPermission());
  const [background, setBackground] = useState<boolean | null>(null);

  if (!supported) {
    return <div className="card small muted">Este navegador não permite notificações. Use o alerta do app ou o lembrete na agenda.</div>;
  }
  return (
    <div className="card">
      <h2>🔔 Notificações</h2>
      {permission !== 'granted' && (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>Avisa no celular quando faltar até {ALERT_DAYS} dias para uma fatura vencer.</p>
          {permission === 'denied'
            ? <p className="small warn">As notificações estão bloqueadas. Libere nas configurações do app no Android.</p>
            : <button className="btn small" onClick={async () => { const r = await enableNotifications(); setPermission(r.permission); setBackground(r.background); }}>Ativar notificações</button>}
        </>
      )}
      {permission === 'granted' && (
        <>
          <p className="small" style={{ marginTop: 0 }}>
            {background === false
              ? '⚠️ Notificações ligadas, mas o Chrome não liberou a checagem com o app fechado. Use o lembrete na agenda.'
              : '✅ Notificações ligadas.'}
          </p>
          <p className="small muted">Com o app fechado, quem decide o horário é o Android e pode atrasar ou não acontecer. Para um aviso garantido, crie também o lembrete na agenda (no vencimento de cada cartão).</p>
          <div className="row">
            <button className="btn small secondary" onClick={showTestNotification}>Testar agora</button>
            <button className="btn small secondary" onClick={async () => setBackground(await registerBackgroundCheck())}>Verificar checagem</button>
          </div>
        </>
      )}
    </div>
  );
}

export function CardsScreen({ month, setMonth }: { month: Month; setMonth: (m: Month) => void }) {
  const data = useData();
  const { card, personName } = useLookups(data);
  const today = todayISO();
  const { bills, outside, totals } = useMemo(() => monthBills(data, month, today), [data, month, today]);
  const debts = useMemo(() => openDebts(data, today), [data, today]);
  const alerts = useMemo(() => dueAlerts(data, today), [data, today]);
  const noDueCards = data.cards.filter((c) => !c.archived && !c.dueDay);
  const [form, setForm] = useState<PayForm | null>(null);
  const [dueCard, setDueCard] = useState<Card | null>(null);
  const [items, setItems] = useState<Bill | null>(null);

  const payBill = (b: Bill) => setForm({
    title: `Pagamento: ${card(b.cardId)?.name} · ${monthLabel(month)}`,
    hint: 'Registre quanto você pagou desta fatura. Pode ser parcial. Isso é só controle: não muda seus gastos nem o saldo.',
    suggested: b.remaining,
    onSave: (amount, date, note) => addCardPayment({ cardId: b.cardId, month, amount, date, note }),
  });
  const receive = (p: PersonBill, cardId: string | null, where: string) => setForm({
    title: `${personName(p.personId)} me pagou`,
    hint: `Parte de ${personName(p.personId)} em ${where}, ${monthLabel(month)}. Pode ser parcial.`,
    suggested: p.pending,
    onSave: (amount, date, note) => addReceipt({ personId: p.personId, month, cardId, amount, date, note }),
  });

  const personRows = (people: PersonBill[], cardId: string | null, where: string) => people.map((p) => (
    <div key={p.personId} className="person-row">
      <div className="between">
        <span className="ellipsis">{personName(p.personId)}</span>
        <span className="row" style={{ flex: 'none' }}>
          <span className="num">{fmt(p.owed)}</span>
          {p.pending > 0
            ? <button className="btn small secondary" onClick={() => receive(p, cardId, where)}>Recebi</button>
            : <span className="badge state-ok">✅ Pagou</span>}
        </span>
      </div>
      {p.received > 0 && p.pending > 0 && <div className="small muted">Já pagou {fmt(p.received)} · falta {fmt(p.pending)}</div>}
      {p.receipts.map((r) => (
        <button key={r.id} className="badge entry" onClick={() => confirm(`Apagar o recebimento de ${fmt(r.amount)}?`) && deleteReceipt(r.id)}>
          {shortDate(r.date)} · {fmt(r.amount)}{r.note ? ` · ${r.note}` : ''} ✕
        </button>
      ))}
    </div>
  ));

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />
      <DueBanner alerts={alerts} onOpen={setMonth} />

      <div className="card">
        <h2>Faturas de {monthLabel(month)}</h2>
        <div className="between"><span>Total</span><strong className="num">{fmt(totals.total)}</strong></div>
        <div className="bar" style={{ margin: '8px 0 6px' }}><div style={{ width: `${totals.total ? (totals.paid / totals.total) * 100 : 0}%` }} /></div>
        <div className="between small muted"><span>Já paguei {fmt(totals.paid)}</span><span>Falta {fmt(totals.remaining)}</span></div>
        {totals.owed > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
            <div className="between"><span>A receber de terceiros</span><strong className="num">{fmt(totals.owed)}</strong></div>
            <div className="between small muted"><span>Recebi {fmt(totals.received)}</span><span>Falta {fmt(totals.pending)}</span></div>
          </div>
        )}
      </div>

      {bills.length === 0 && <div className="card empty-state"><div className="ico">💳</div><p>Nenhuma fatura neste mês.</p></div>}

      {bills.map((b) => {
        const info = card(b.cardId);
        return (
          <div key={b.cardId} className="card">
            <div className="between">
              <strong className="row ellipsis" style={{ fontSize: 17 }}>
                <i style={{ width: 10, height: 10, borderRadius: 5, background: info?.color, display: 'block', flex: 'none' }} />{info?.name}
              </strong>
              <strong className="num" style={{ fontSize: 17 }}>{fmt(b.total)}</strong>
            </div>
            <div className="between" style={{ marginTop: 6 }}>
              <DueChip bill={b} />
              {info && (
                <button className="link-btn" onClick={() => setDueCard(info)}>
                  {info.dueDay ? `✏️ vence dia ${info.dueDay}` : '📅 Informar vencimento'}
                </button>
              )}
            </div>
            <div className="bar" style={{ margin: '10px 0 6px' }}><div style={{ width: `${b.total ? Math.min(100, (b.paid / b.total) * 100) : 0}%` }} /></div>
            <div className="between small muted"><span>Paguei {fmt(b.paid)}</span><span>Falta {fmt(b.remaining)}</span></div>
            {b.payments.map((p) => (
              <button key={p.id} className="badge entry" onClick={() => confirm(`Apagar o pagamento de ${fmt(p.amount)}?`) && deleteCardPayment(p.id)}>
                {shortDate(p.date)} · {fmt(p.amount)}{p.note ? ` · ${p.note}` : ''} ✕
              </button>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              {b.remaining > 0 && <button className="btn small" onClick={() => payBill(b)}>Registrar pagamento</button>}
              <button className="btn small secondary" onClick={() => setItems(b)}>Ver itens</button>
            </div>
            {b.people.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div className="between small muted" style={{ marginBottom: 4 }}><span>Meu {fmt(b.mine)}</span><span>Terceiros {fmt(b.total - b.mine)}</span></div>
                {personRows(b.people, b.cardId, info?.name ?? 'cartão')}
              </div>
            )}
          </div>
        );
      })}

      {outside.length > 0 && (
        <div className="card">
          <h2>Fora do cartão (fixos e Pix divididos)</h2>
          {personRows(outside, null, 'gastos fora do cartão')}
        </div>
      )}

      <div className="card">
        <h2>Quem ainda me deve (até hoje)</h2>
        {debts.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Ninguém com pagamento em aberto. 🎉</p> : (
          <div className="list">
            {debts.map((d) => (
              <div key={d.personId} className="item" style={{ display: 'block' }}>
                <div className="between"><strong>{personName(d.personId)}</strong><strong className="num">{fmt(d.pending)}</strong></div>
                <div className="small muted">{d.months.map((m) => `${monthLabelShort(m.month)}: ${fmt(m.pending)}`).join(' · ')}</div>
              </div>
            ))}
          </div>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>Conta a partir do mês em que você começou a usar este controle. Meses anteriores não entram, porque não foram registrados.</p>
      </div>

      {noDueCards.length > 0 && (
        <div className="card">
          <h2>Cartões sem vencimento</h2>
          <div className="chips">{noDueCards.map((c) => <button key={c.id} className="chip" onClick={() => setDueCard(c)}>📅 {c.name}</button>)}</div>
        </div>
      )}

      <NotificationsCard />

      {form && <PaySheet form={form} onClose={() => setForm(null)} />}
      {dueCard && <DueSheet card={dueCard} onClose={() => setDueCard(null)} />}
      {items && (
        <Sheet title={`${card(items.cardId)?.name} · ${monthLabel(month)}`} onClose={() => setItems(null)}>
          <div className="list">
            {[...items.lines].sort((a, b) => b.amount - a.amount).map((l, i) => <LineRow key={i} line={l} value={l.amount} />)}
          </div>
          <div className="between" style={{ marginTop: 10, fontWeight: 700 }}><span>Total</span><span className="num">{fmt(items.total)}</span></div>
        </Sheet>
      )}
    </>
  );
}
