import type { Dataset } from './db/types';
import { emptyDataset } from './db/types';

export const BACKUP_APP = 'controle-financeiro';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Dataset;
}

export const makeBackup = (data: Dataset): BackupFile => ({
  app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data,
});

export function parseBackup(text: string): Dataset {
  const obj = JSON.parse(text) as Partial<BackupFile>;
  if (obj.app !== BACKUP_APP || !obj.data) throw new Error('Este arquivo não é um backup do Controle Financeiro.');
  return { ...emptyDataset(), ...obj.data };
}
