import { AlertTriangle, ChevronRight, Clock, Save, Sparkles, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { dueLabel, type OpenBill } from '../engine/bills';
import { fmt } from '../lib/money';
import type { Month } from '../lib/months';
import { BACKUP_REMINDER_DAYS, daysSinceBackup, exportBackup, KEY_BACKUP_SNOOZE, KEY_LAST_BACKUP } from '../lib/backupFile';
import { addDaysISO, todayISO } from '../lib/months';
import { applyUpdate, useUpdateAvailable } from '../lib/pwaUpdate';
import { useData } from './common';

/** Avisa que há versão nova; só atualiza quando você mandar. */
export function UpdateBar() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <div className="card notice">
      <Sparkles size={16} style={{ flex: 'none' }} aria-hidden />
      <span className="grow small">Nova versão disponível. Atualize quando terminar o que está fazendo.</span>
      <button className="btn small" onClick={() => applyUpdate()}>Atualizar</button>
    </div>
  );
}

/** Fatura mais urgente em uma linha; o restante vira "+N". */
export function DueStrip({ alerts, onOpen, children }: { alerts: OpenBill[]; onOpen: (m: Month, cardId: string) => void; children?: React.ReactNode }) {
  const top = alerts[0];
  if (!top) return null;
  return (
    <div className={`strip ${top.days < 0 ? 'late' : 'soon'}`}>
      <button className="strip-main" onClick={() => onOpen(top.month, top.cardId)}>
        {top.days < 0 ? <AlertTriangle size={16} aria-hidden /> : <Clock size={16} aria-hidden />}
        <span className="ellipsis grow"><strong>{top.cardName}</strong> {dueLabel(top.days)}{!children && ` · ${fmt(top.remaining)}`}</span>
        {alerts.length > 1 && <span className="strip-more">+{alerts.length - 1}</span>}
        <ChevronRight size={16} aria-hidden />
      </button>
      {children}
    </div>
  );
}

/** Uma faixa só na tela inicial: fatura urgente e, se preciso, o lembrete de backup. */
export function HomeStrip({ alerts, onOpen }: { alerts: OpenBill[]; onOpen: (m: Month, cardId: string) => void }) {
  const data = useData();
  const last = useLiveQuery(() => db.meta.get(KEY_LAST_BACKUP), []);
  const snooze = useLiveQuery(() => db.meta.get(KEY_BACKUP_SNOOZE), []);
  const [error, setError] = useState('');
  const today = todayISO();
  const days = daysSinceBackup(last?.value, today);
  const hasData = data.transactions.length + data.installments.length > 0;
  const snoozed = typeof snooze?.value === 'string' && snooze.value > today;
  const needsBackup = hasData && !snoozed && (days === null || days >= BACKUP_REMINDER_DAYS);
  const backup = () => exportBackup().catch((e) => setError(`Não consegui: ${(e as Error).message}`));

  return (
    <>
      <DueStrip alerts={alerts} onOpen={onOpen}>
        {needsBackup && <button className="strip-pill" onClick={backup}><Save size={14} aria-hidden /> Backup</button>}
      </DueStrip>
      {!alerts.length && needsBackup && (
        <div className="strip">
          <Save size={16} style={{ flex: 'none', marginLeft: 12 }} aria-hidden />
          <span className="grow small ellipsis" style={{ padding: '10px 0' }}>{days === null ? 'Nenhum backup registrado' : `Último backup há ${days} dias`}</span>
          <button className="strip-pill" onClick={backup}>Fazer</button>
          <button className="icon-btn" aria-label="Lembrar depois" onClick={() => db.meta.put({ key: KEY_BACKUP_SNOOZE, value: addDaysISO(today, 3) })}><X size={16} /></button>
        </div>
      )}
      {error && <p className="neg small">{error}</p>}
    </>
  );
}
