import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { loadDataset } from '../db/db';
import { ME, type Dataset } from '../db/types';
import { addMonths, monthLabelLong, type Month } from '../lib/months';

/** Todos os dados do app, sempre atualizados (relê o banco a cada mudança). */
export function useDataset(): Dataset | undefined {
  return useLiveQuery(loadDataset, []);
}

/** Dicionários para mostrar nomes a partir dos ids. */
export function useLookups(data: Dataset) {
  const card = (id?: string | null) => data.cards.find((c) => c.id === id);
  const category = (id?: string) => data.categories.find((c) => c.id === id);
  const personName = (id?: string) =>
    id === ME ? 'Eu' : id === '?' ? 'Sem pessoa definida' : data.people.find((p) => p.id === id)?.name ?? '—';
  return { card, category, personName };
}

const DataCtx = createContext<Dataset | null>(null);
export const DataProvider = ({ data, children }: { data: Dataset; children: ReactNode }) => (
  <DataCtx.Provider value={data}>{children}</DataCtx.Provider>
);
export function useData(): Dataset {
  const d = useContext(DataCtx);
  if (!d) throw new Error('DataProvider ausente');
  return d;
}

export function MonthPicker({ month, onChange }: { month: Month; onChange: (m: Month) => void }) {
  return (
    <div className="month-picker">
      <button aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>‹</button>
      <div className="mp-label">{monthLabelLong(month)}</div>
      <button aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}>›</button>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Avatar({ icon, color }: { icon: string; color?: string }) {
  return <div className="avatar" style={{ background: (color ?? '#94a3b8') + '26' }}>{icon}</div>;
}
