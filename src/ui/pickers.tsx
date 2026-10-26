import { useState } from 'react';
import { addCard, addCategory, addPerson } from '../db/actions';
import { ME } from '../db/types';
import type { Line } from '../engine/engine';
import { fmt, parseMoney, type Cents } from '../lib/money';
import { Avatar, useData, useLookups } from './common';

export const centsToText = (c?: Cents) => (c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));

/** Chip "+ Novo" que vira um campo de texto para criar o item na hora. */
export function InlineAdd({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) return <button type="button" className="chip add" onClick={() => setOpen(true)}>+ {label}</button>;
  const submit = async () => { if (name.trim()) await onAdd(name.trim()); setOpen(false); setName(''); };
  return (
    <span className="row" style={{ width: '100%' }}>
      <input className="input grow" autoFocus placeholder={`Nome (${label.toLowerCase()})`} value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())} />
      <button type="button" className="btn small" onClick={submit}>OK</button>
    </span>
  );
}

export function PersonChips({ value, onChange, withMe = false, allowAdd = true }: { value: string; onChange: (id: string) => void; withMe?: boolean; allowAdd?: boolean }) {
  const people = useData().people.filter((p) => !p.archived || p.id === value).sort((a, b) => a.order - b.order);
  return (
    <div className="chips">
      {withMe && <button type="button" className={`chip ${value === ME ? 'on' : ''}`} onClick={() => onChange(ME)}>🙋 Eu</button>}
      {people.map((p) => (
        <button key={p.id} type="button" className={`chip ${value === p.id ? 'on' : ''}`} onClick={() => onChange(p.id)}>{p.name}</button>
      ))}
      {allowAdd && <InlineAdd label="Pessoa" onAdd={async (n) => onChange((await addPerson(n)).id)} />}
    </div>
  );
}

export function CardChips({ value, onChange, allowNone = false }: { value?: string; onChange: (id: string | undefined) => void; allowNone?: boolean }) {
  const cards = useData().cards.filter((c) => !c.archived || c.id === value).sort((a, b) => a.order - b.order);
  return (
    <div className="chips">
      {allowNone && <button type="button" className={`chip ${!value ? 'on' : ''}`} onClick={() => onChange(undefined)}>Sem cartão</button>}
      {cards.map((c) => (
        <button key={c.id} type="button" className={`chip ${value === c.id ? 'on' : ''}`} onClick={() => onChange(c.id)}>
          <i style={{ width: 8, height: 8, borderRadius: 4, background: c.color, display: 'block' }} /> {c.name}
        </button>
      ))}
      <InlineAdd label="Cartão" onAdd={async (n) => onChange((await addCard(n)).id)} />
    </div>
  );
}

export function CategoryChips({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const cats = useData().categories.filter((c) => !c.archived || c.id === value).sort((a, b) => a.order - b.order);
  return (
    <div className="chips">
      {cats.map((c) => (
        <button key={c.id} type="button" className={`chip ${value === c.id ? 'on' : ''}`} onClick={() => onChange(c.id)}>{c.icon} {c.name}</button>
      ))}
      <InlineAdd label="Categoria" onAdd={async (n) => onChange((await addCategory(n)).id)} />
    </div>
  );
}

/** Divisão "minha parte + quem paga o resto". */
export function SplitEditor({ total, myShareText, setMyShareText, restPerson, setRestPerson, totalLabel = 'Fatura recebe' }: {
  total: Cents; myShareText: string; setMyShareText: (s: string) => void; restPerson: string; setRestPerson: (s: string) => void; totalLabel?: string;
}) {
  const mine = parseMoney(myShareText) ?? 0;
  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <div className="field">
        <label>Minha parte (R$)</label>
        <div className="row">
          <input className="input grow" inputMode="decimal" value={myShareText} onChange={(e) => setMyShareText(e.target.value)} placeholder="0,00" />
          <button type="button" className="btn small secondary" onClick={() => setMyShareText(centsToText(Math.round(total / 2)))}>Metade</button>
          <button type="button" className="btn small secondary" onClick={() => setMyShareText('0')}>Nada</button>
        </div>
      </div>
      <div className="field" style={{ marginBottom: 6 }}>
        <span className="label">Quem paga o resto</span>
        <PersonChips value={restPerson} onChange={setRestPerson} />
      </div>
      {total > 0 && (
        <p className="small" style={{ margin: 0 }}>
          {totalLabel} <strong>{fmt(total)}</strong> · meu gasto <strong>{fmt(mine)}</strong> · a receber <strong>{fmt(total - mine)}</strong>
        </p>
      )}
    </div>
  );
}

/** Uma linha calculada pelo motor (compra, parcela, fixo ou Pix). */
export function LineRow({ line, value, showPeople = true }: { line: Line; value: Cents; showPeople?: boolean }) {
  const data = useData();
  const { card, category, personName } = useLookups(data);
  const cat = category(line.categoryId);
  const others = Object.entries(line.others);
  return (
    <div className="item">
      <Avatar icon={line.source === 'recurring' ? '🔁' : line.source === 'installment' ? '📆' : line.source === 'pix' ? '⚡' : cat?.icon ?? '🏷️'} color={cat?.color} />
      <div className="grow">
        <div className="ellipsis">{line.description}</div>
        <div className="small muted ellipsis">
          {[line.detail, line.cardId ? card(line.cardId)?.name : line.source === 'pix' ? 'Pix' : null,
            ...(showPeople ? others.map(([pid, v]) => `${personName(pid)} ${fmt(v)}`) : [])].filter(Boolean).join(' · ')}
        </div>
      </div>
      <span className="num">{fmt(value)}</span>
    </div>
  );
}
