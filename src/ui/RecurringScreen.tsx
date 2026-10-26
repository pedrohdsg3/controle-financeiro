import { useState } from 'react';
import { deleteRecurring, saveRecurring } from '../db/actions';
import type { PayMethod, Recurring, RecurringType } from '../db/types';
import { recurringActiveIn, shares } from '../engine/engine';
import { fmt, parseMoney } from '../lib/money';
import { addMonths, currentMonth, monthLabel, monthLabelShort, type Month } from '../lib/months';
import { ME } from '../db/types';
import { Sheet, useData, useLookups } from './common';
import { CardChips, CategoryChips, centsToText, SplitEditor } from './pickers';

const TYPES: RecurringType[] = ['Assinatura', 'Conta', 'Boleto', 'Fixo/Mensal'];
const METHODS: PayMethod[] = ['Cartão', 'Pix', 'Boleto', 'Débito'];

function RecurringForm({ initial, onClose }: { initial?: Recurring; onClose: () => void }) {
  const data = useData();
  const [description, setDescription] = useState(initial?.description ?? '');
  const [type, setType] = useState<RecurringType>(initial?.type ?? 'Assinatura');
  const [payMethod, setPayMethod] = useState<PayMethod>(initial?.payMethod ?? 'Cartão');
  const [cardId, setCardId] = useState<string | undefined>(initial?.cardId ?? data.cards.find((c) => !c.archived)?.id);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? data.categories.find((c) => c.name === 'Assinaturas')?.id ?? data.categories[0]?.id);
  const [amountText, setAmountText] = useState(centsToText(initial?.amount));
  const [dueDay, setDueDay] = useState(initial?.dueDay ?? 10);
  const [startMonth, setStartMonth] = useState<Month>(initial?.startMonth ?? currentMonth());
  const [endMonth, setEndMonth] = useState<Month | ''>(initial?.endMonth ?? '');
  const [skipMonths, setSkipMonths] = useState<Month[]>(initial?.skipMonths ?? []);
  const [skipInput, setSkipInput] = useState<Month>(currentMonth());
  const [splitOn, setSplitOn] = useState(!!initial?.split);
  const [myShareText, setMyShareText] = useState(centsToText(initial?.split?.myShare));
  const [restPerson, setRestPerson] = useState(initial?.split?.restPersonId ?? '');
  const [err, setErr] = useState('');
  const amount = parseMoney(amountText) ?? 0;

  const save = async () => {
    if (!description.trim()) return setErr('Dê um nome.');
    if (amount <= 0) return setErr('Digite o valor.');
    if (payMethod === 'Cartão' && !cardId) return setErr('Escolha o cartão.');
    if (endMonth && endMonth < startMonth) return setErr('O último mês não pode ser antes do primeiro.');
    const myShare = parseMoney(myShareText) ?? 0;
    if (splitOn && (myShare < 0 || myShare > amount)) return setErr('“Minha parte” precisa estar entre 0 e o valor.');
    if (splitOn && myShare < amount && !restPerson) return setErr('Escolha quem paga o resto.');
    await saveRecurring({
      id: initial?.id, createdAt: initial?.createdAt, description: description.trim(), type, payMethod,
      cardId: payMethod === 'Cartão' ? cardId : undefined, categoryId, amount, dueDay, startMonth,
      endMonth: endMonth || undefined, skipMonths: [...skipMonths].sort(),
      split: splitOn ? { myShare, restPersonId: restPerson } : undefined,
    });
    onClose();
  };

  return (
    <Sheet title={initial ? 'Editar fixo' : 'Novo fixo / assinatura'} onClose={onClose}>
      <div className="field"><label>Descrição</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Netflix, academia, conta de luz" /></div>
      <div className="row">
        <div className="field grow"><label>Valor mensal (R$)</label><input className="input" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" /></div>
        <div className="field" style={{ width: 90 }}><label>Vence dia</label>
          <input className="input" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} />
        </div>
      </div>
      <div className="field"><span className="label">Tipo</span>
        <div className="chips">{TYPES.map((t) => <button key={t} type="button" className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{t}</button>)}</div>
      </div>
      <div className="field"><span className="label">Forma de pagamento</span>
        <div className="chips">{METHODS.map((t) => <button key={t} type="button" className={`chip ${payMethod === t ? 'on' : ''}`} onClick={() => setPayMethod(t)}>{t}</button>)}</div>
        <p className="small muted" style={{ margin: 0 }}>{payMethod === 'Cartão' ? 'Entra na fatura do cartão escolhido.' : 'Entra em “Fixos/Boletos (não-cartão)” no Resumo.'}</p>
      </div>
      {payMethod === 'Cartão' && <div className="field"><span className="label">Cartão</span><CardChips value={cardId} onChange={setCardId} /></div>}
      <div className="field"><span className="label">Categoria</span><CategoryChips value={categoryId} onChange={setCategoryId} /></div>
      <div className="row">
        <div className="field grow"><label>Começa em</label><input className="input" type="month" value={startMonth} onChange={(e) => e.target.value && setStartMonth(e.target.value)} /></div>
        <div className="field grow"><label>Último mês (opcional)</label><input className="input" type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} /></div>
      </div>
      <div className="field">
        <span className="label">Meses que NÃO paga</span>
        <div className="chips">
          {skipMonths.sort().map((m) => <button key={m} type="button" className="chip on" onClick={() => setSkipMonths(skipMonths.filter((x) => x !== m))}>{monthLabel(m)} ✕</button>)}
        </div>
        <div className="row">
          <input className="input grow" type="month" value={skipInput} onChange={(e) => setSkipInput(e.target.value)} />
          <button type="button" className="btn small secondary" onClick={() => skipInput && !skipMonths.includes(skipInput) && setSkipMonths([...skipMonths, skipInput])}>Pular este mês</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Ex: academia trancada em janeiro.</p>
      </div>
      <label className="toggle"><span>➗ Dividir (alguém paga parte ou tudo)</span><input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} /></label>
      {splitOn && <SplitEditor total={amount} myShareText={myShareText} setMyShareText={setMyShareText} restPerson={restPerson} setRestPerson={setRestPerson} totalLabel="Cobrança" />}
      {err && <p className="neg small">{err}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        {initial && <button className="btn danger small" onClick={async () => {
          if (confirm('Apagar de vez? Ele some também dos meses passados.\n\nPara só parar de cobrar, use “Último mês”.')) { await deleteRecurring(initial.id); onClose(); }
        }}>Apagar</button>}
        <button className="btn" onClick={save}>Salvar</button>
      </div>
    </Sheet>
  );
}

export function RecurringScreen() {
  const data = useData();
  const { card, category, personName } = useLookups(data);
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const now = currentMonth();
  const list = [...data.recurring].sort((a, b) => a.dueDay - b.dueDay);
  const active = list.filter((r) => !r.endMonth || r.endMonth >= now);
  const ended = list.filter((r) => r.endMonth && r.endMonth < now);
  const thisMonth = active.filter((r) => recurringActiveIn(r, now));
  const totalMine = thisMonth.reduce((a, r) => a + shares(r.amount, ME, r.split).mine, 0);
  const total = thisMonth.reduce((a, r) => a + r.amount, 0);

  const item = (r: Recurring) => {
    const cat = category(r.categoryId);
    const skipNow = r.skipMonths.includes(now);
    const mine = shares(r.amount, ME, r.split).mine;
    return (
      <button key={r.id} className="item" onClick={() => setEditing(r)} style={{ opacity: skipNow ? 0.6 : 1 }}>
        <div className="avatar" style={{ background: (cat?.color ?? '#94a3b8') + '26', fontSize: 13, fontWeight: 700 }}>{r.dueDay}</div>
        <div className="grow">
          <div className="between"><span className="ellipsis">{cat?.icon} {r.description}</span><strong className="num">{fmt(r.amount)}</strong></div>
          <div className="small muted ellipsis">
            {r.cardId ? `💳 ${card(r.cardId)?.name}` : r.payMethod} · {r.type}
            {r.split && ` · ${personName(r.split.restPersonId)} paga ${fmt(r.amount - mine)}`}
            {skipNow && ' · não cobra este mês'}
            {r.endMonth && ` · até ${monthLabelShort(r.endMonth)}`}
            {r.skipMonths.filter((m) => m > now).length > 0 && ` · pula ${r.skipMonths.filter((m) => m > now).map(monthLabelShort).join(', ')}`}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <div className="hint">Cadastre uma vez e o app cobra todo mês sozinho. Para cancelar, edite e preencha o “Último mês” — assim os meses passados continuam certos.</div>
      <button className="btn" style={{ marginBottom: 12 }} onClick={() => setEditing('new')}>+ Novo fixo / assinatura</button>
      <div className="card">
        <h2>Em {monthLabel(now)}</h2>
        <div className="between"><span>Total cobrado</span><strong className="num">{fmt(total)}</strong></div>
        <div className="between small"><span className="muted">Minha parte</span><span className="num">{fmt(totalMine)}</span></div>
      </div>
      <div className="card">
        <h2>Ativos ({active.length}) · por dia de vencimento</h2>
        {active.length === 0 ? <p className="muted small">Nenhum cadastrado.</p> : <div className="list">{active.map(item)}</div>}
      </div>
      {ended.length > 0 && (
        <div className="card"><h2>Encerrados ({ended.length})</h2><div className="list">{ended.map(item)}</div></div>
      )}
      <p className="small muted" style={{ textAlign: 'center' }}>Dica: a cobrança de {monthLabel(addMonths(now, 1))} já aparece no Resumo daquele mês.</p>
      {editing && <RecurringForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
