import { Check, ClipboardPaste } from 'lucide-react';
import { useMemo, useState } from 'react';
import { db, newId } from '../db/db';
import { ME } from '../db/types';
import { applyPlan, planPaste, shareOnCard, type PlanAction, type PlanItem } from '../import/pasteList';
import { fmt } from '../lib/money';
import { monthLabel, todayISO, type Month } from '../lib/months';
import { Sheet, useData, useLookups } from './common';
import { CardChips, PersonChips } from './pickers';

const BADGE: Record<PlanAction, string> = {
  cash: 'À vista', installment: 'Parcelado', 'old-installment': 'Parcelado (antigo)', exists: 'Já no app', fix: 'Corrigir', duplicate: 'Repetido',
};
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Cola a lista da fatura (uma compra por linha), confere a prévia e lança tudo de uma vez. */
export function PasteListSheet({ cardId: initialCard, month: initialMonth, onClose }: { cardId?: string; month: Month; onClose: () => void }) {
  const data = useData();
  const { card, personName } = useLookups(data);
  const categories = data.categories.filter((c) => !c.archived).sort((a, b) => a.order - b.order);
  const [cardId, setCardId] = useState<string | undefined>(initialCard ?? data.cards.find((c) => !c.archived)?.id);
  const [personId, setPersonId] = useState<string>('');
  const [month, setMonth] = useState<Month>(initialMonth);
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState('');
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const defaultCategoryId = categories.find((c) => norm(c.name) === 'compras')?.id ?? categories[0]?.id ?? '';

  const opts = { cardId: cardId ?? '', personId, month, date, defaultCategoryId };
  const preview = () => {
    setErr('');
    if (!text.trim()) return setErr('Cole a lista primeiro.');
    if (!cardId) return setErr('Escolha o cartão.');
    // "Nome:" na primeira linha já escolhe a pessoa.
    const plan = planPaste(data, text, opts);
    let who = personId;
    if (!who && plan.header) who = data.people.find((p) => norm(p.name) === norm(plan.header!))?.id ?? '';
    if (!who) return setErr('Escolha de quem são os gastos (ou comece a lista com "Nome:").');
    if (who !== personId) setPersonId(who);
    const final = who === personId ? plan : planPaste(data, text, { ...opts, personId: who });
    if (!final.items.length) return setErr('Não reconheci nenhuma linha. Use o formato "Descrição - 12,34" ou "Descrição - 12,34 1/3".');
    setItems(final.items);
    setUnreadable(final.unreadable);
  };

  const listTotal = items?.reduce((a, i) => a + i.line.amount, 0) ?? 0;
  const result = useMemo(() => (items && cardId ? applyPlan(data, items, { ...opts, personId }, () => 'preview') : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, data, cardId, personId, month, date]);
  const after = result && cardId ? shareOnCard(result.data, cardId, personId, month) : 0;
  const toWrite = items?.filter((i) => i.include && i.action !== 'exists').length ?? 0;

  const save = async () => {
    if (!items || !cardId) return;
    const r = applyPlan(data, items, { ...opts, personId }, newId);
    await db.transaction('rw', db.transactions, db.installments, async () => {
      await db.transactions.bulkAdd(r.transactions);
      await db.installments.bulkAdd(r.installments);
      await db.installments.bulkPut(r.fixes);
    });
    setDone(`${r.transactions.length} à vista, ${r.installments.length} parcelados${r.fixes.length ? ` e ${r.fixes.length} correção(ões)` : ''} lançados.`);
  };

  const toggle = (idx: number, patch: Partial<PlanItem>) => setItems((list) => list!.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const who = personId === ME ? 'Minha parte' : personName(personId);

  if (done) {
    return (
      <Sheet title="Lista lançada" onClose={onClose}>
        <div className="empty-state"><div className="ico"><Check size={32} /></div><p>{done}</p></div>
        <p className="small" style={{ textAlign: 'center' }}>{who} no {card(cardId)?.name} em {monthLabel(month)}: <strong>{fmt(cardId ? shareOnCard(data, cardId, personId, month) : 0)}</strong></p>
        <button className="btn" onClick={onClose}>Fechar</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Colar lista da fatura" onClose={onClose}>
      {!items ? (
        <>
          <div className="field"><span className="label">Cartão</span><CardChips value={cardId} onChange={setCardId} /></div>
          <div className="field"><span className="label">De quem são os gastos</span><PersonChips value={personId} onChange={setPersonId} withMe /></div>
          <div className="row">
            <div className="field grow"><label>Fatura de</label><input className="input" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></div>
            <div className="field grow"><label>Data das compras</label><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Lista (uma compra por linha)</label>
            <textarea className="input" rows={9} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={'Maria:\nMercado - 120,50 2/2\nPosto - 200\nLoja de roupas - 89,90 1/3'} />
            <p className="small muted" style={{ margin: 0 }}>“1/3” = 1ª de 3 parcelas, cobrada nesta fatura. Sem barra = à vista.</p>
          </div>
          {err && <p className="neg small">{err}</p>}
          <button className="btn" onClick={preview}><ClipboardPaste size={16} aria-hidden /> Ver prévia</button>
        </>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>{card(cardId)?.name} · {who} · fatura de {monthLabel(month)}. Desmarque o que não quiser lançar.</p>
          <div className="list">
            {items.map((it, idx) => (
              <div key={idx} className="item" style={{ alignItems: 'flex-start', opacity: it.include || it.action === 'exists' ? 1 : 0.55 }}>
                <input type="checkbox" checked={it.include} disabled={it.action === 'exists'} onChange={(e) => toggle(idx, { include: e.target.checked })}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--accent)' }} aria-label={`Lançar ${it.line.description}`} />
                <div className="grow">
                  <div className="between">
                    <span className="ellipsis">{it.line.description}</span>
                    <span className="num">{fmt(it.line.amount)}{it.line.m > 1 ? ` ${it.line.n}/${it.line.m}` : ''}</span>
                  </div>
                  <div className="row small" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                    <span className={`badge ${it.action === 'fix' || it.action === 'duplicate' ? 'state-warn' : it.action === 'exists' ? 'state-ok' : ''}`}>{BADGE[it.action]}</span>
                    {it.action !== 'exists' && it.action !== 'fix' && (
                      <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} value={it.categoryId} onChange={(e) => toggle(idx, { categoryId: e.target.value })} aria-label="Categoria">
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                  {(it.action === 'fix' || it.action === 'exists' || it.action === 'old-installment' || it.action === 'duplicate') && <div className="small muted">{it.note}</div>}
                </div>
              </div>
            ))}
          </div>
          {unreadable.length > 0 && <p className="small warn">Não entendi e vou ignorar: {unreadable.join(' · ')}</p>}
          <div className="card" style={{ background: 'var(--surface-2)', marginTop: 10 }}>
            <div className="between small"><span className="muted">Total da lista</span><strong className="num">{fmt(listTotal)}</strong></div>
            <div className="between small" style={{ marginTop: 4 }}><span className="muted">{who} no cartão depois de lançar</span><strong className="num">{fmt(after)}</strong></div>
            <p className="small" style={{ margin: '6px 0 0' }}>
              {after === listTotal
                ? <span className="pos">Bate com a lista.</span>
                : <span className="warn">Diferença de {fmt(after - listTotal)}: existem outros gastos de {who} neste cartão e mês que não estão na lista, ou itens desmarcados.</span>}
            </p>
          </div>
          <div className="row">
            <button className="btn secondary" onClick={() => setItems(null)}>Voltar</button>
            <button className="btn" disabled={!toWrite} onClick={save}>Lançar {toWrite} {toWrite === 1 ? 'item' : 'itens'}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
