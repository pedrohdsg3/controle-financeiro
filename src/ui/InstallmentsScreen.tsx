import { useMemo, useState } from 'react';
import { deleteInstallment, saveInstallment } from '../db/actions';
import { ME, type Installment } from '../db/types';
import { installmentLastMonth, installmentNumberIn, shares } from '../engine/engine';
import { fmt, parseMoney, splitInstallments } from '../lib/money';
import { addMonths, currentMonth, monthLabel, monthLabelShort, type Month } from '../lib/months';
import { Sheet, useData, useLookups } from './common';
import { CardChips, CategoryChips, centsToText, PersonChips, SplitEditor } from './pickers';

function InstallmentForm({ initial, onClose }: { initial?: Installment; onClose: () => void }) {
  const data = useData();
  const [description, setDescription] = useState(initial?.description ?? '');
  const [totalText, setTotalText] = useState(centsToText(initial?.total));
  const [count, setCount] = useState(initial?.count ?? 2);
  const [startMonth, setStartMonth] = useState<Month>(initial?.startMonth ?? currentMonth());
  const [cardId, setCardId] = useState<string | undefined>(initial?.cardId ?? data.cards.find((c) => !c.archived)?.id);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? data.categories[0]?.id);
  const [usedBy, setUsedBy] = useState(initial?.usedBy ?? ME);
  const [splitOn, setSplitOn] = useState(!!initial?.split);
  const [myShareText, setMyShareText] = useState(centsToText(initial?.split?.myShare));
  const [restPerson, setRestPerson] = useState(initial?.split?.restPersonId ?? '');
  const [err, setErr] = useState('');
  const total = parseMoney(totalText) ?? 0;

  const save = async () => {
    if (!description.trim()) return setErr('Dê um nome para a compra.');
    if (total <= 0) return setErr('Digite o valor total.');
    if (!cardId) return setErr('Escolha o cartão.');
    const myShare = parseMoney(myShareText) ?? 0;
    if (splitOn && (myShare < 0 || myShare > total)) return setErr('“Minha parte” precisa estar entre 0 e o total.');
    if (splitOn && myShare < total && !restPerson) return setErr('Escolha quem paga o resto.');
    await saveInstallment({
      id: initial?.id, createdAt: initial?.createdAt, purchaseDate: initial?.purchaseDate,
      description: description.trim(), total, count, startMonth, cardId, categoryId,
      usedBy: splitOn ? ME : usedBy, split: splitOn ? { myShare, restPersonId: restPerson } : undefined,
    });
    onClose();
  };

  return (
    <Sheet title={initial ? 'Editar parcelamento' : 'Novo parcelamento'} onClose={onClose}>
      <div className="field"><label>Descrição</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Notebook" /></div>
      <div className="row">
        <div className="field grow"><label>Valor TOTAL (R$)</label><input className="input" inputMode="decimal" value={totalText} onChange={(e) => setTotalText(e.target.value)} placeholder="0,00" /></div>
        <div className="field" style={{ width: 90 }}><label>Parcelas</label>
          <input className="input" type="number" min={1} max={72} value={count} onChange={(e) => setCount(Math.max(1, Math.min(72, Number(e.target.value) || 1)))} />
        </div>
      </div>
      <div className="field"><label>Fatura da 1ª parcela</label><input className="input" type="month" value={startMonth} onChange={(e) => e.target.value && setStartMonth(e.target.value)} /></div>
      {total > 0 && (
        <p className="small muted" style={{ marginTop: -6 }}>
          {count}× de {fmt(splitInstallments(total, count)[count > 1 ? 1 : 0])} · de {monthLabel(startMonth)} até {monthLabel(addMonths(startMonth, count - 1))}
        </p>
      )}
      <div className="field"><span className="label">Cartão</span><CardChips value={cardId} onChange={setCardId} /></div>
      <div className="field"><span className="label">Categoria</span><CategoryChips value={categoryId} onChange={setCategoryId} /></div>
      {!splitOn && <div className="field"><span className="label">Quem usou</span><PersonChips value={usedBy} onChange={setUsedBy} withMe /></div>}
      <label className="toggle"><span>➗ Dividir com alguém</span><input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} /></label>
      {splitOn && <SplitEditor total={total} myShareText={myShareText} setMyShareText={setMyShareText} restPerson={restPerson} setRestPerson={setRestPerson} totalLabel="Total da compra" />}
      {err && <p className="neg small">{err}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        {initial && <button className="btn danger small" onClick={async () => { if (confirm('Apagar este parcelamento e todas as parcelas?')) { await deleteInstallment(initial.id); onClose(); } }}>Apagar</button>}
        <button className="btn" onClick={save}>Salvar</button>
      </div>
    </Sheet>
  );
}

export function InstallmentsScreen() {
  const data = useData();
  const { card, category, personName } = useLookups(data);
  const [editing, setEditing] = useState<Installment | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const now = currentMonth();

  const active = data.installments.filter((i) => installmentLastMonth(i) >= now).sort((a, b) => (installmentLastMonth(a) < installmentLastMonth(b) ? -1 : 1));
  const done = data.installments.filter((i) => installmentLastMonth(i) < now);

  // Quanto das minhas parcelas cai em cada um dos próximos 12 meses.
  const ahead = useMemo(() => Array.from({ length: 12 }, (_, k) => {
    const m = addMonths(now, k);
    let mine = 0;
    let total = 0;
    for (const i of data.installments) {
      const n = installmentNumberIn(i, m);
      if (!n) continue;
      const amount = splitInstallments(i.total, i.count)[n - 1];
      const myPart = i.split ? splitInstallments(i.split.myShare, i.count)[n - 1] : shares(amount, i.usedBy).mine;
      mine += myPart;
      total += amount;
    }
    return { m, mine, total };
  }), [data.installments, now]);
  const max = Math.max(1, ...ahead.map((a) => a.total));

  const item = (i: Installment) => {
    const n = installmentNumberIn(i, now);
    const paid = n ? n : installmentLastMonth(i) < now ? i.count : 0;
    const parcel = splitInstallments(i.total, i.count)[Math.max(0, (n ?? 1) - 1)];
    const cat = category(i.categoryId);
    return (
      <button key={i.id} className="item" onClick={() => setEditing(i)}>
        <div className="grow">
          <div className="between"><span className="ellipsis">{cat?.icon} {i.description}</span><strong className="num">{fmt(parcel)}</strong></div>
          <div className="bar" style={{ height: 6, margin: '6px 0 4px' }}><div style={{ width: `${(paid / i.count) * 100}%` }} /></div>
          <div className="between small muted">
            <span className="ellipsis">{card(i.cardId)?.name} · {n ? `parcela ${n}/${i.count}` : paid ? 'quitado' : `começa ${monthLabelShort(i.startMonth)}`}
              {i.usedBy !== ME && ` · ${personName(i.usedBy)}`}{i.split && ` · dividido c/ ${personName(i.split.restPersonId)}`}</span>
            <span>até {monthLabelShort(installmentLastMonth(i))}</span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <div className="hint">Registre a compra parcelada uma vez só: o app coloca cada parcela na fatura certa, inclusive virando o ano.</div>
      <button className="btn" style={{ marginBottom: 12 }} onClick={() => setEditing('new')}>+ Novo parcelamento</button>

      <div className="card">
        <h2>Parcelas nos próximos 12 meses</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110 }}>
          {ahead.map((a) => (
            <div key={a.m} title={`${monthLabel(a.m)}: total ${fmt(a.total)} · meu ${fmt(a.mine)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', gap: 2 }}>
              {a.total - a.mine > 0 && <div style={{ height: `${((a.total - a.mine) / max) * 100}%`, background: '#eb6834', borderRadius: '4px 4px 0 0' }} />}
              {a.mine > 0 && <div style={{ height: `${(a.mine / max) * 100}%`, background: '#2a78d6', borderRadius: a.total - a.mine > 0 ? 0 : '4px 4px 0 0' }} />}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {ahead.map((a) => <div key={a.m} className="small muted" style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>{monthLabelShort(a.m).slice(0, 3)}</div>)}
        </div>
        <div className="legend"><span><i style={{ background: '#2a78d6' }} />Meu</span><span><i style={{ background: '#eb6834' }} />Terceiros</span></div>
        <div className="between small" style={{ marginTop: 8 }}>
          <span className="muted">Este mês (meu)</span><strong className="num">{fmt(ahead[0].mine)}</strong>
        </div>
        <div className="between small"><span className="muted">Daqui a 6 meses (meu)</span><span className="num">{fmt(ahead[6].mine)}</span></div>
      </div>

      <div className="card">
        <h2>Em andamento ({active.length})</h2>
        {active.length === 0 ? <p className="muted small">Nenhum parcelamento em andamento.</p> : <div className="list">{active.map(item)}</div>}
      </div>
      {done.length > 0 && (
        <div className="card">
          <button className="between" style={{ width: '100%', background: 'none', border: 0, padding: 0 }} onClick={() => setShowDone(!showDone)}>
            <h2 style={{ margin: 0 }}>Quitados ({done.length})</h2><span className="muted">{showDone ? '▴' : '▾'}</span>
          </button>
          {showDone && <div className="list" style={{ marginTop: 8 }}>{done.map(item)}</div>}
        </div>
      )}
      {editing && <InstallmentForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
