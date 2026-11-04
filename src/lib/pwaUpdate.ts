/**
 * Atualização sob controle: a versão nova fica esperando até você tocar em "Atualizar",
 * para o app nunca recarregar no meio de um lançamento.
 */
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

let needsRefresh = false;
const listeners = new Set<() => void>();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    needsRefresh = true;
    listeners.forEach((l) => l());
  },
  onRegisteredSW(_url, registration) {
    // App instalado costuma voltar do segundo plano sem recarregar: procura versão nova nessa hora.
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
    });
  },
});

export const applyUpdate = () => updateSW(true);

export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(needsRefresh);
  useEffect(() => {
    const l = () => setAvailable(true);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return available;
}
