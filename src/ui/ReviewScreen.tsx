import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import type { Installment, Transaction } from '../db/types';
import { reviewIssues } from '../engine/review';
import { fmt } from '../lib/money';
import { monthLabel } from '../lib/months';
import { useData, useLookups } from './common';
import { InstallmentForm } from './InstallmentsScreen';

export const KEY_REVIEW_DISMISSED = 'reviewDismissed';

export function ReviewScreen({ onEditTx }: { onEditTx: (t: Transaction) => void }) {
  const data = useData();
  const { card } = useLookups(data);
  const stored = useLiveQuery(() => db.meta.get(KEY_REVIEW_DISMISSED), []);
  const dismissed = (stored?.value as string[] | undefined) ?? [];
  const issues = reviewIssues(data, dismissed);
  const [editing, setEditing] = useState<Installment | null>(null);
  const dismiss = (key: string) => db.meta.put({ key: KEY_REVIEW_DISMISSED, value: [...dismissed, key] });

  return (
    <>
      <div className="hint">O app procura lançamentos que parecem errados. Nada é alterado sozinho: você corrige ou marca que está certo.</div>
      {issues.length === 0 && <div className="card empty-state"><div className="ico">✅</div><p>Nada suspeito.</p></div>}
      {issues.map((i) => {
        const t = i.tx;
        const inst = i.installment;
        return (
          <div key={i.key} className="card">
            <div className="between">
              <strong className="ellipsis">{t?.description ?? inst?.description}</strong>
              <strong className="num">{fmt(t?.amount ?? inst?.total ?? 0)}</strong>
            </div>
            <div className="small muted">
              {t ? `${t.date.split('-').reverse().join('/')} · ${t.kind === 'card' ? `${card(t.cardId)?.name ?? '?'} · fatura ${monthLabel(t.month)}` : 'Pix'}`
                : inst ? `${card(inst.cardId)?.name ?? '?'} · ${inst.count}× desde ${monthLabel(inst.startMonth)}` : ''}
            </div>
            <p className="small warn" style={{ margin: '6px 0 0' }}>{i.reason}</p>
            <div className="review-actions">
              <button className="btn small" onClick={() => (t ? onEditTx(t) : inst && setEditing(inst))}>Corrigir</button>
              <button className="btn small secondary" onClick={() => dismiss(i.key)}>Está certo</button>
            </div>
          </div>
        );
      })}
      {editing && <InstallmentForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
