import { CalendarPlus, Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { addCardPayment, deleteCardPayment, setCardDetails } from '../db/actions';
import type { Card, CardFinish } from '../db/types';
import {
  ALERT_DAYS, calendarLink, daysBetween, dueAlerts, dueDateOf, monthBills, type Bill,
} from '../engine/bills';
import { fmt, parseMoney, type Cents } from '../lib/money';
import { monthLabel, todayISO, type ISODate, type Month } from '../lib/months';
import {
  enableNotifications, notificationPermission, notificationsSupported, registerBackgroundCheck, showTestNotification,
} from '../lib/notify';
import { cardFinish, cardProduct, FINISHES } from '../lib/cardStyle';
import { CardWallet } from './CardWallet';
import { Money, MonthPicker, Sheet, useData, useLookups } from './common';
import { DueStrip } from './Notices';
import { centsToText, LineRow } from './pickers';

const shortDate = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export interface PayForm {
  title: string;
  hint: string;
  suggested: Cents;
  onSave: (amount: Cents, date: ISODate, note?: string) => Promise<void>;
}

export function PaySheet({ form, onClose }: { form: PayForm; onClose: () => void }) {
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
  const [closing, setClosing] = useState(card.closingDay ? String(card.closingDay) : '');
  const [product, setProduct] = useState(cardProduct(card));
  const [finish, setFinish] = useState<CardFinish>(cardFinish(card));
  const [err, setErr] = useState('');
  const link = calendarLink(card, todayISO());
  const save = async () => {
    const valid = (t: string) => !t || (Number.isInteger(Number(t)) && Number(t) >= 1 && Number(t) <= 31);
    if (!valid(text) || !valid(closing)) return setErr('Digite um dia entre 1 e 31.');
    await setCardDetails(card, { dueDay: text ? Number(text) : undefined, closingDay: closing ? Number(closing) : undefined, product: product.trim(), finish });
    onClose();
  };
  return (
    <Sheet title={card.name} onClose={onClose}>
      <div className="row">
        <div className="field grow">
          <label>Vence dia</label>
          <input className="input" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex: 15" />
        </div>
        <div className="field grow">
          <label>Fecha dia</label>
          <input className="input" inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="Ex: 8" />
        </div>
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>Os avisos começam {ALERT_DAYS} dias antes do vencimento.</p>
      <div className="field">
        <label>Nome no cartão</label>
        <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ex: Carbon Black, Ultravioleta, Platinum" />
      </div>
      <div className="field">
        <span className="label">Aparência</span>
        <div className="chips">
          {FINISHES.map((f) => <button key={f.id} type="button" className={`chip ${finish === f.id ? 'on' : ''}`} onClick={() => setFinish(f.id)}>{f.label}</button>)}
        </div>
      </div>
      {err && <p className="neg small">{err}</p>}
      <button className="btn" onClick={save}>Salvar</button>
      {link && (
        <>
          <div style={{ height: 8 }} />
          <a className="btn secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }} href={link} target="_blank" rel="noreferrer">
            <CalendarPlus size={16} style={{ verticalAlign: '-0.2em' }} aria-hidden /> Criar lembrete mensal na agenda do Google
          </a>
          <p className="small muted" style={{ marginBottom: 0 }}>É o jeito mais garantido de o celular avisar. Só o nome do cartão vai para a agenda.</p>
        </>
      )}
    </Sheet>
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
      <h2>Notificações</h2>
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
              ? 'Notificações ligadas, mas o Chrome não liberou a checagem com o app fechado. Use o lembrete na agenda.'
              : 'Notificações ligadas.'}
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

export function CardsScreen({ month, setMonth, goToPeople, focusCard }: { month: Month; setMonth: (m: Month) => void; goToPeople: () => void; focusCard?: string }) {
  const data = useData();
  const { card } = useLookups(data);
  const today = todayISO();
  const { bills, totals } = useMemo(() => monthBills(data, month, today), [data, month, today]);
  const alerts = useMemo(() => dueAlerts(data, today), [data, today]);
  const [form, setForm] = useState<PayForm | null>(null);
  const [dueCard, setDueCard] = useState<Card | null>(null);
  const [items, setItems] = useState<Bill | null>(null);

  // Todos os cartões na carteira: primeiro os que têm fatura no mês.
  const wallet = useMemo(() => {
    const list = data.cards.filter((c) => !c.archived || bills.some((b) => b.cardId === c.id)).sort((a, b) => a.order - b.order).map((c) => {
      const due = dueDateOf(c, month);
      const bill: Bill = bills.find((b) => b.cardId === c.id) ?? {
        cardId: c.id, month, total: 0, mine: 0, paid: 0, remaining: 0, dueDate: due, days: due ? daysBetween(today, due) : null, payments: [], people: [], lines: [],
      };
      return { card: c, bill };
    });
    return [...list.filter((x) => x.bill.total > 0), ...list.filter((x) => x.bill.total <= 0)];
  }, [data.cards, bills, month, today]);

  const [activeId, setActiveId] = useState<string | undefined>(focusCard ?? alerts.find((a) => a.month === month)?.cardId);
  useEffect(() => { if (focusCard) setActiveId(focusCard); }, [focusCard]);
  const found = wallet.findIndex((x) => x.card.id === activeId);
  const active = found >= 0 ? found : 0;
  const current = wallet[active];
  const b = current?.bill;
  const info = current?.card;

  const payBill = (bill: Bill) => setForm({
    title: `Pagamento: ${card(bill.cardId)?.name} · ${monthLabel(month)}`,
    hint: 'Registre quanto você pagou desta fatura. Pode ser parcial. Isso é só controle: não muda seus gastos nem o saldo.',
    suggested: bill.remaining,
    onSave: (amount, date, note) => addCardPayment({ cardId: bill.cardId, month, amount, date, note }),
  });

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />
      <DueStrip alerts={alerts} onOpen={(m, id) => { setMonth(m); setActiveId(id); }} />

      {wallet.length > 0 && <CardWallet items={wallet} active={active} onActive={(i) => setActiveId(wallet[i].card.id)} />}
      {wallet.length > 0 && <p className="small muted" style={{ textAlign: 'center', margin: '2px 0 12px' }}>Deslize para trocar · toque para virar</p>}

      {b && info && (
        <div className="card">
          <div className="between small"><span className="muted">Paguei</span><span className="muted">Falta</span></div>
          <div className="between"><Money value={b.paid} className="money-md" /><Money value={b.remaining} className="money-md" /></div>
          <div className="bar" style={{ margin: '8px 0' }}><div style={{ width: `${b.total ? Math.min(100, (b.paid / b.total) * 100) : 0}%` }} /></div>
          {b.payments.map((p) => (
            <button key={p.id} className="badge entry" onClick={() => confirm(`Apagar o pagamento de ${fmt(p.amount)}?`) && deleteCardPayment(p.id)}>
              {shortDate(p.date)} · {fmt(p.amount)}{p.note ? ` · ${p.note}` : ''} ✕
            </button>
          ))}
          <div className="chips" style={{ marginTop: 10 }}>
            {b.remaining > 0 && <button className="btn small" onClick={() => payBill(b)}>Registrar pagamento</button>}
            {b.lines.length > 0 && <button className="btn small secondary" onClick={() => setItems(b)}>Ver itens</button>}
            <button className="btn small secondary" onClick={() => setDueCard(info)}><Pencil size={14} aria-hidden /> Cartão</button>
          </div>
          {b.people.length > 0 && (
            <button className="between small muted" style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--border)', marginTop: 12, padding: '8px 0 0' }} onClick={goToPeople}>
              <span>Meu {fmt(b.mine)}</span><span>Terceiros {fmt(b.total - b.mine)} ›</span>
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h2>Todas as faturas de {monthLabel(month)}</h2>
        <div className="between"><span>Total</span><strong className="num">{fmt(totals.total)}</strong></div>
        <div className="bar" style={{ margin: '8px 0 6px' }}><div style={{ width: `${totals.total ? (totals.paid / totals.total) * 100 : 0}%` }} /></div>
        <div className="between small muted"><span>Já paguei {fmt(totals.paid)}</span><span>Falta {fmt(totals.remaining)}</span></div>
        {totals.owed > 0 && (
          <button style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderTop: '1px solid var(--border)', marginTop: 10, padding: '10px 0 0' }} onClick={goToPeople}>
            <div className="between"><span>Parte de terceiros nestas faturas ›</span><strong className="num">{fmt(totals.owed)}</strong></div>
            <div className="between small muted"><span>Recebi {fmt(totals.received)}</span><span>Falta {fmt(totals.pending)}</span></div>
          </button>
        )}
      </div>

      <NotificationsCard />

      {form && <PaySheet form={form} onClose={() => setForm(null)} />}
      {dueCard && <DueSheet card={dueCard} onClose={() => setDueCard(null)} />}
      {items && (
        <Sheet title={`${card(items.cardId)?.name} · ${monthLabel(month)}`} onClose={() => setItems(null)}>
          <div className="list">
            {[...items.lines].sort((x, y) => y.amount - x.amount).map((l, i) => <LineRow key={i} line={l} value={l.amount} />)}
          </div>
          <div className="between" style={{ marginTop: 10, fontWeight: 700 }}><span>Total</span><span className="num">{fmt(items.total)}</span></div>
        </Sheet>
      )}
    </>
  );
}
