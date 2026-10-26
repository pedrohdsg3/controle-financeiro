import { useEffect, useMemo, useRef, useState } from 'react';
import { addCard, addCategory, addPerson, deleteTransaction, saveInstallment, saveTransaction } from '../db/actions';
import { ME, type Split, type Transaction, type TxKind } from '../db/types';
import { suggestBillMonth } from '../engine/engine';
import { fmt, parseMoney, splitInstallments } from '../lib/money';
import { addMonths, monthLabel, monthOf, todayISO, type ISODate, type Month } from '../lib/months';
import { Sheet, useData } from './common';

const LAST_CARD = 'qa:lastCard';
const LAST_KIND = 'qa:lastKind';
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

/** Chip "+ Novo" que vira um campo de texto para criar cartão/categoria/pessoa na hora. */
function InlineAdd({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) return <button type="button" className="chip add" onClick={() => setOpen(true)}>+ {label}</button>;
  const submit = async () => { if (name.trim()) await onAdd(name.trim()); setOpen(false); setName(''); };
  return (
    <span className="row" style={{ width: '100%' }}>
      <input className="input grow" autoFocus placeholder={`Nome do ${label.toLowerCase()}`} value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())} />
      <button type="button" className="btn small" onClick={submit}>OK</button>
    </span>
  );
}

export interface QuickAddProps {
  date?: ISODate;
  editing?: Transaction;
  onClose: () => void;
}

export function QuickAdd({ date: initialDate, editing, onClose }: QuickAddProps) {
  const data = useData();
  const cards = data.cards.filter((c) => !c.archived).sort((a, b) => a.order - b.order);
  const categories = data.categories.filter((c) => !c.archived).sort((a, b) => a.order - b.order);
  const people = data.people.filter((p) => !p.archived).sort((a, b) => a.order - b.order);

  const [kind, setKind] = useState<TxKind>(editing?.kind ?? ((safeGet(LAST_KIND) as TxKind) || 'card'));
  const [amountText, setAmountText] = useState(editing ? (editing.amount / 100).toFixed(2).replace('.', ',') : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [cardId, setCardId] = useState(editing?.cardId ?? safeGet(LAST_CARD) ?? cards[0]?.id ?? '');
  const [date, setDate] = useState<ISODate>(editing?.date ?? initialDate ?? todayISO());
  const [monthOverride, setMonthOverride] = useState<Month | null>(editing?.month ?? null);
  const [usedBy, setUsedBy] = useState(editing?.usedBy ?? ME);
  const [splitOn, setSplitOn] = useState(!!editing?.split);
  const [myShareText, setMyShareText] = useState(editing?.split ? (editing.split.myShare / 100).toFixed(2).replace('.', ',') : '');
  const [restPerson, setRestPerson] = useState(editing?.split?.restPersonId ?? '');
  const [installOn, setInstallOn] = useState(false);
  const [count, setCount] = useState(2);
  const [error, setError] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) amountRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!cards.find((c) => c.id === cardId) && cards[0]) setCardId(cards[0].id); }, [cards, cardId]);

  const amount = parseMoney(amountText) ?? 0;
  const card = cards.find((c) => c.id === cardId);
  const autoMonth = kind === 'card' ? suggestBillMonth(card, date) : monthOf(date);
  const month = monthOverride ?? autoMonth;

  const myShare = parseMoney(myShareText) ?? 0;
  const preview = useMemo(() => {
    if (!splitOn || !amount) return null;
    return { mine: myShare, rest: amount - myShare };
  }, [splitOn, amount, myShare]);

  async function save(addAnother = false) {
    setError('');
    if (amount <= 0) return setError('Digite um valor.');
    if (kind === 'card' && !cardId) return setError('Escolha um cartão.');
    let split: Split | undefined;
    if (kind !== 'income' && splitOn) {
      if (myShare < 0 || myShare > amount) return setError('"Minha parte" precisa estar entre 0 e o valor total.');
      if (myShare < amount && !restPerson) return setError('Escolha quem paga o resto.');
      split = { myShare, restPersonId: restPerson };
    }
    const cat = categories.find((c) => c.id === categoryId);
    const desc = description.trim() || (kind === 'income' ? 'Receita' : cat?.name ?? 'Gasto');
    const who = split ? ME : usedBy;

    if (kind === 'card' && installOn && count >= 2 && !editing) {
      await saveInstallment({
        description: desc, cardId, categoryId: categoryId || categories[0]?.id, usedBy: who, split,
        total: amount, count, startMonth: month, purchaseDate: date,
      });
    } else {
      await saveTransaction({
        id: editing?.id, createdAt: editing?.createdAt, kind, date, month, description: desc,
        cardId: kind === 'card' ? cardId : undefined,
        categoryId: kind === 'income' ? undefined : categoryId || categories[0]?.id,
        amount, usedBy: kind === 'income' ? ME : who, split: kind === 'income' ? undefined : split,
      });
    }
    safeSet(LAST_KIND, kind);
    if (kind === 'card') safeSet(LAST_CARD, cardId);
    if (addAnother) {
      setAmountText(''); setDescription(''); setSplitOn(false); setMyShareText(''); setInstallOn(false);
      amountRef.current?.focus();
    } else onClose();
  }

  async function remove() {
    if (editing && confirm('Apagar este lançamento?')) { await deleteTransaction(editing.id); onClose(); }
  }

  const title = editing ? 'Editar lançamento' : 'Novo lançamento';
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="seg">
        {(['card', 'pix', 'income'] as TxKind[]).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setMonthOverride(null); }}>
            {k === 'card' ? '💳 Cartão' : k === 'pix' ? '⚡ Pix' : '💰 Receita'}
          </button>
        ))}
      </div>

      <input ref={amountRef} className="amount-input num" inputMode="decimal" placeholder="R$ 0,00" value={amountText}
        onChange={(e) => setAmountText(e.target.value)} aria-label="Valor" />
      {installOn && amount > 0 && (
        <p className="small muted" style={{ textAlign: 'center', marginTop: 0 }}>
          {count}× de {fmt(splitInstallments(amount, count)[1])} · de {monthLabel(month)} a {monthLabel(addMonths(month, count - 1))}
        </p>
      )}

      {kind !== 'income' && (
        <div className="field">
          <span className="label">Categoria</span>
          <div className="chips">
            {categories.map((c) => (
              <button key={c.id} type="button" className={`chip ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
            <InlineAdd label="Categoria" onAdd={async (n) => setCategoryId((await addCategory(n)).id)} />
          </div>
        </div>
      )}

      {kind === 'card' && (
        <div className="field">
          <span className="label">Cartão</span>
          <div className="chips">
            {cards.map((c) => (
              <button key={c.id} type="button" className={`chip ${cardId === c.id ? 'on' : ''}`}
                onClick={() => { setCardId(c.id); setMonthOverride(null); }}>
                <i style={{ width: 8, height: 8, borderRadius: 4, background: c.color, display: 'block' }} /> {c.name}
              </button>
            ))}
            <InlineAdd label="Cartão" onAdd={async (n) => setCardId((await addCard(n)).id)} />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="qa-desc">Descrição (opcional)</label>
        <input id="qa-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === 'income' ? 'Ex: 13º, bônus, reembolso' : 'Ex: Almoço, Uber, farmácia'} />
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field grow">
          <label htmlFor="qa-date">Data</label>
          <input id="qa-date" type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setMonthOverride(null); }} />
        </div>
        <div className="field grow">
          <span className="label">{kind === 'card' ? 'Fatura de' : 'Conta no mês'}</span>
          <div className="row">
            <button type="button" className="icon-btn" onClick={() => setMonthOverride(addMonths(month, -1))}>‹</button>
            <strong className="grow" style={{ textAlign: 'center', fontSize: 14 }}>{monthLabel(month)}</strong>
            <button type="button" className="icon-btn" onClick={() => setMonthOverride(addMonths(month, 1))}>›</button>
          </div>
        </div>
      </div>
      {kind === 'card' && card?.closingDay && !monthOverride && (
        <p className="small muted" style={{ marginTop: -8 }}>
          O {card.name} fecha dia {card.closingDay}: compras a partir desse dia vão para a fatura do mês seguinte.
        </p>
      )}
      {kind === 'income' && (
        <p className="small muted" style={{ marginTop: -8 }}>
          Dica: o 13º que cai em 30/10 pode contar como renda de novembro — é só avançar o mês.
        </p>
      )}

      {kind !== 'income' && (
        <>
          {!splitOn && (
            <div className="field">
              <span className="label">Quem usou</span>
              <div className="chips">
                <button type="button" className={`chip ${usedBy === ME ? 'on' : ''}`} onClick={() => setUsedBy(ME)}>🙋 Eu</button>
                {people.map((p) => (
                  <button key={p.id} type="button" className={`chip ${usedBy === p.id ? 'on' : ''}`} onClick={() => setUsedBy(p.id)}>{p.name}</button>
                ))}
                <InlineAdd label="Pessoa" onAdd={async (n) => setUsedBy((await addPerson(n)).id)} />
              </div>
              {usedBy !== ME && <p className="small muted" style={{ margin: 0 }}>O valor todo entra no que essa pessoa te deve.</p>}
            </div>
          )}

          <label className="toggle">
            <span>➗ Dividir com alguém</span>
            <input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} />
          </label>
          {splitOn && (
            <div className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="field">
                <label htmlFor="qa-mine">Minha parte (R$)</label>
                <div className="row">
                  <input id="qa-mine" className="input grow" inputMode="decimal" value={myShareText} onChange={(e) => setMyShareText(e.target.value)} placeholder="0,00" />
                  <button type="button" className="btn small secondary" onClick={() => setMyShareText((amount / 200).toFixed(2).replace('.', ','))}>Metade</button>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <span className="label">Quem paga o resto</span>
                <div className="chips">
                  {people.map((p) => (
                    <button key={p.id} type="button" className={`chip ${restPerson === p.id ? 'on' : ''}`} onClick={() => setRestPerson(p.id)}>{p.name}</button>
                  ))}
                </div>
              </div>
              {preview && (
                <p className="small" style={{ margin: 0 }}>
                  Fatura recebe <strong>{fmt(amount)}</strong> · meu gasto <strong>{fmt(preview.mine)}</strong> · a receber <strong>{fmt(preview.rest)}</strong>
                </p>
              )}
            </div>
          )}

          {kind === 'card' && !editing && (
            <>
              <label className="toggle">
                <span>📆 Compra parcelada</span>
                <input type="checkbox" checked={installOn} onChange={(e) => setInstallOn(e.target.checked)} />
              </label>
              {installOn && (
                <div className="field">
                  <label htmlFor="qa-n">Número de parcelas (o valor acima é o TOTAL)</label>
                  <input id="qa-n" className="input" type="number" min={2} max={48} value={count}
                    onChange={(e) => setCount(Math.max(2, Math.min(48, Number(e.target.value) || 2)))} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {error && <p className="neg small">{error}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        {editing
          ? <button className="btn danger small" onClick={remove}>Apagar</button>
          : <button className="btn secondary" onClick={() => save(true)}>Salvar e lançar outro</button>}
        <button className="btn" onClick={() => save(false)}>Salvar</button>
      </div>
    </Sheet>
  );
}
