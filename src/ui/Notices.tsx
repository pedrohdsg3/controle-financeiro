import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
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
      <span className="grow small">✨ Nova versão disponível. Atualize quando terminar o que está fazendo.</span>
      <button className="btn small" onClick={() => applyUpdate()}>Atualizar</button>
    </div>
  );
}

/** Lembra de fazer backup, já que os dados só existem neste aparelho. */
export function BackupReminder() {
  const data = useData();
  const last = useLiveQuery(() => db.meta.get(KEY_LAST_BACKUP), []);
  const snooze = useLiveQuery(() => db.meta.get(KEY_BACKUP_SNOOZE), []);
  const [error, setError] = useState('');
  const today = todayISO();
  const days = daysSinceBackup(last?.value, today);
  const hasData = data.transactions.length + data.installments.length > 0;
  const snoozed = typeof snooze?.value === 'string' && snooze.value > today;
  if (!hasData || snoozed || (days !== null && days < BACKUP_REMINDER_DAYS)) return null;
  return (
    <div className="card notice">
      <div className="grow small">
        💾 {days === null ? 'Nenhum backup registrado.' : `Último backup há ${days} dias.`} Seus dados só existem neste celular.
        {error && <div className="neg">{error}</div>}
      </div>
      <div className="row" style={{ flex: 'none' }}>
        <button className="btn small secondary" onClick={() => db.meta.put({ key: KEY_BACKUP_SNOOZE, value: addDaysISO(today, 3) })}>Depois</button>
        <button className="btn small" onClick={() => exportBackup().catch((e) => setError(`Não consegui: ${(e as Error).message}`))}>Fazer</button>
      </div>
    </div>
  );
}
