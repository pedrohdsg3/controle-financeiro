import { makeBackup } from '../backup';
import { db, loadDataset, replaceDataset } from '../db/db';
import type { Dataset } from '../db/types';
import { todayISO } from './months';

export const KEY_LAST_BACKUP = 'lastBackupAt';
export const KEY_BACKUP_SNOOZE = 'backupSnoozeUntil';
export const KEY_RESTORE_SNAPSHOT = 'preRestoreSnapshot';
export const BACKUP_REMINDER_DAYS = 7;

export type BackupResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Manda o backup pelo menu de compartilhar do Android (Drive, WhatsApp, e-mail); sem esse menu, baixa o arquivo.
 * Vai como .txt porque o Chrome não permite compartilhar .json. O conteúdo é o mesmo, e a restauração aceita os dois.
 */
export async function exportBackup(): Promise<BackupResult> {
  const content = JSON.stringify(makeBackup(await loadDataset()));
  const name = `financas-backup-${todayISO()}`;
  const file = new File([content], `${name}.txt`, { type: 'text/plain' });
  let result: BackupResult;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Backup do Controle Financeiro' });
      result = 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      throw e;
    }
  } else {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    result = 'downloaded';
  }
  await db.meta.put({ key: KEY_LAST_BACKUP, value: todayISO() });
  return result;
}

/** Substitui os dados, guardando antes uma cópia dos atuais para poder desfazer. */
export async function restoreWithSnapshot(data: Dataset) {
  const current = await loadDataset();
  await db.meta.put({ key: KEY_RESTORE_SNAPSHOT, value: { at: todayISO(), data: current } });
  await replaceDataset(data);
  await db.meta.put({ key: 'seeded', value: true });
}

export async function undoRestore(): Promise<boolean> {
  const snap = await db.meta.get(KEY_RESTORE_SNAPSHOT);
  if (!snap) return false;
  await replaceDataset((snap.value as { data: Dataset }).data);
  await db.meta.delete(KEY_RESTORE_SNAPSHOT);
  return true;
}

/** Dias desde o último backup; null = nunca feito. */
export function daysSinceBackup(last: unknown, today: string): number | null {
  if (typeof last !== 'string') return null;
  return Math.round((Date.parse(today) - Date.parse(last)) / 86400000);
}
