/**
 * Notificações sem servidor. Limite real: quem decide quando acordar o app em segundo plano é o
 * Chrome (Periodic Background Sync, só com o app instalado), então o horário não é garantido.
 * O aviso confiável é o alerta dentro do app; a agenda do Google é o plano B para o celular apitar.
 */
import { db } from '../db/db';
import type { Dataset } from '../db/types';
import { openBills } from '../engine/bills';
import { todayISO } from './months';

type PeriodicSync = { register(tag: string, o: { minInterval: number }): Promise<void> };

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;

export const notificationPermission = (): NotificationPermission | 'unsupported' =>
  notificationsSupported() ? Notification.permission : 'unsupported';

/** Pede ao Chrome para checar vencimentos em segundo plano. Devolve false se ele não permitir. */
export async function registerBackgroundCheck(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as ServiceWorkerRegistration & { periodicSync?: PeriodicSync }).periodicSync;
    if (!sync) return false;
    const perm = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (perm.state !== 'granted') return false;
    await sync.register('vencimentos', { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function enableNotifications(): Promise<{ permission: NotificationPermission; background: boolean }> {
  const permission = await Notification.requestPermission();
  return { permission, background: permission === 'granted' ? await registerBackgroundCheck() : false };
}

export async function showTestNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Notificações ativadas', { body: 'É assim que o aviso de vencimento vai aparecer.', icon: 'icon-192.png' });
}

/** Grava a lista de faturas em aberto para o service worker consultar quando o app estiver fechado. */
export async function syncDueSchedule(data: Dataset) {
  const schedule = openBills(data, todayISO()).map(({ cardId, cardName, month, dueDate, remaining }) => ({ cardId, cardName, month, dueDate, remaining }));
  await db.meta.put({ key: 'dueSchedule', value: schedule });
}
