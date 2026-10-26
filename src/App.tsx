import { useEffect, useState } from 'react';
import { ensureDefaults } from './db/actions';
import type { Transaction } from './db/types';
import { currentMonth, type ISODate } from './lib/months';
import { CalendarScreen } from './ui/CalendarScreen';
import { DataProvider, useDataset } from './ui/common';
import { MoreScreen, type Theme } from './ui/MoreScreen';
import { QuickAdd } from './ui/QuickAdd';
import { SummaryScreen } from './ui/SummaryScreen';

type Tab = 'calendar' | 'summary' | 'people' | 'history' | 'more';
const TABS: { id: Tab; icon: string; label: string; title: string }[] = [
  { id: 'calendar', icon: '📅', label: 'Calendário', title: 'Calendário' },
  { id: 'summary', icon: '📊', label: 'Resumo', title: 'Resumo do mês' },
  { id: 'people', icon: '👥', label: 'Terceiros', title: 'Terceiros' },
  { id: 'history', icon: '📈', label: 'Histórico', title: 'Histórico' },
  { id: 'more', icon: '☰', label: 'Mais', title: 'Mais' },
];

const loadTheme = (): Theme => { try { return (localStorage.getItem('theme') as Theme) || 'auto'; } catch { return 'auto'; } };

function Soon({ what, phase }: { what: string; phase: string }) {
  return (
    <div className="card empty-state">
      <div className="ico">🚧</div>
      <p><strong>{what}</strong> chega na {phase}.</p>
      <p className="small">Os cálculos já existem — o Resumo já mostra quanto cada pessoa te deve.</p>
    </div>
  );
}

export default function App() {
  const data = useDataset();
  const [tab, setTab] = useState<Tab>('calendar');
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState<{ date?: ISODate; editing?: Transaction } | null>(null);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => { ensureDefaults(); }, []);
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* sem armazenamento */ }
  }, [theme]);

  if (!data) return <div className="app"><p className="muted" style={{ paddingTop: 40, textAlign: 'center' }}>Carregando…</p></div>;

  const current = TABS.find((t) => t.id === tab)!;
  return (
    <DataProvider data={data}>
      <div className="app">
        <header className="topbar"><h1>{current.title}</h1></header>
        {tab === 'calendar' && (
          <CalendarScreen month={month} setMonth={setMonth} onAdd={(date) => setAdding({ date })}
            onEdit={(t) => setAdding({ editing: t })} goToBackup={() => setTab('more')} />
        )}
        {tab === 'summary' && <SummaryScreen month={month} setMonth={setMonth} />}
        {tab === 'people' && <Soon what="A tela de Terceiros (quem me deve / quem eu devo)" phase="Etapa 3" />}
        {tab === 'history' && <Soon what="O Histórico anual com gráficos e projeções" phase="Etapa 5" />}
        {tab === 'more' && <MoreScreen theme={theme} setTheme={setTheme} />}
      </div>

      <button className="fab" aria-label="Lançar gasto ou receita" onClick={() => setAdding({})}>+</button>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <span className="ico">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>
      {adding && <QuickAdd date={adding.date} editing={adding.editing} onClose={() => setAdding(null)} />}
    </DataProvider>
  );
}
