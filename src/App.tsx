import { CalendarDays, ChartPie, CreditCard, Menu, Moon, Plus, Sun, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ensureDefaults } from './db/actions';
import type { Transaction } from './db/types';
import { dueAlerts } from './engine/bills';
import { currentMonth, todayISO, type ISODate } from './lib/months';
import { notificationPermission, registerBackgroundCheck, syncDueSchedule } from './lib/notify';
import { CardsScreen } from './ui/CardsScreen';
import { CalendarScreen } from './ui/CalendarScreen';
import { DarkContext, DataProvider, useDataset } from './ui/common';
import { MoreScreen, type Theme } from './ui/MoreScreen';
import { QuickAdd } from './ui/QuickAdd';
import { SummaryScreen } from './ui/SummaryScreen';
import { PeopleScreen } from './ui/PeopleScreen';
import { HistoryScreen } from './ui/HistoryScreen';
import { Loading } from './ui/Guards';
import { HomeStrip, UpdateBar } from './ui/Notices';

type Tab = 'calendar' | 'accounts' | 'summary' | 'history' | 'more';
const TABS: { id: Tab; icon: LucideIcon; label: string; title: string }[] = [
  { id: 'calendar', icon: CalendarDays, label: 'Calendário', title: 'Calendário' },
  { id: 'accounts', icon: CreditCard, label: 'Contas', title: 'Contas' },
  { id: 'summary', icon: ChartPie, label: 'Resumo', title: 'Resumo do mês' },
  { id: 'history', icon: TrendingUp, label: 'Histórico', title: 'Histórico' },
  { id: 'more', icon: Menu, label: 'Mais', title: 'Mais' },
];

const loadTheme = (): Theme => { try { return (localStorage.getItem('theme') as Theme) || 'auto'; } catch { return 'auto'; } };

export default function App() {
  const data = useDataset();
  const [tab, setTab] = useState<Tab>('calendar');
  const [accountsView, setAccountsView] = useState<'cards' | 'people'>('cards');
  const [focusCard, setFocusCard] = useState<string | undefined>();
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState<{ date?: ISODate; editing?: Transaction } | null>(null);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isDark = theme === 'dark' || (theme === 'auto' && systemDark);

  const alerts = useMemo(() => (data ? dueAlerts(data, todayISO()) : []), [data]);

  useEffect(() => { ensureDefaults(); }, []);
  // Mantém atualizada a lista que o service worker consulta com o app fechado.
  useEffect(() => { if (data) syncDueSchedule(data).catch(() => {}); }, [data]);
  useEffect(() => { if (notificationPermission() === 'granted') registerBackgroundCheck(); }, []);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* sem armazenamento */ }
  }, [theme]);
  useEffect(() => {
    // Barra de status do celular acompanha o tema.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#161616' : '#f4f5f8');
  }, [isDark]);

  if (!data) return <Loading />;

  const current = TABS.find((t) => t.id === tab)!;
  return (
    <DarkContext.Provider value={isDark}>
    <DataProvider data={data}>
      <div className="app">
        <header className="topbar">
          <h1>{current.title}</h1>
          <button className="theme-toggle" onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'} title={isDark ? 'Tema claro' : 'Tema escuro'}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>
        <UpdateBar />
        {tab === 'calendar' && (
          <>
            <HomeStrip alerts={alerts} onOpen={(m, cardId) => { setMonth(m); setFocusCard(cardId); setAccountsView('cards'); setTab('accounts'); }} />
            <CalendarScreen month={month} setMonth={setMonth} onAdd={(date) => setAdding({ date })}
              onEdit={(t) => setAdding({ editing: t })} goToBackup={() => setTab('more')} />
          </>
        )}
        {tab === 'accounts' && (
          <>
            <div className="seg">
              <button className={accountsView === 'cards' ? 'on' : ''} onClick={() => setAccountsView('cards')}><CreditCard size={15} /> Cartões</button>
              <button className={accountsView === 'people' ? 'on' : ''} onClick={() => setAccountsView('people')}><Users size={15} /> Pessoas</button>
            </div>
            {accountsView === 'cards'
              ? <CardsScreen month={month} setMonth={setMonth} goToPeople={() => setAccountsView('people')} focusCard={focusCard} />
              : <PeopleScreen month={month} setMonth={setMonth} />}
          </>
        )}
        {tab === 'summary' && <SummaryScreen month={month} setMonth={setMonth} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'more' && <MoreScreen theme={theme} setTheme={setTheme} onEditTx={(t) => setAdding({ editing: t })} />}
      </div>

      <button className="fab" aria-label="Lançar gasto ou receita" onClick={() => setAdding({})}><Plus size={28} /></button>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <t.icon className="ico" size={22} strokeWidth={tab === t.id ? 2.4 : 1.8} aria-hidden />{t.label}
              {t.id === 'accounts' && alerts.length > 0 && <span className="count">{alerts.length}</span>}
            </button>
          ))}
        </div>
      </nav>
      {adding && <QuickAdd date={adding.date} editing={adding.editing} onClose={() => setAdding(null)} />}
    </DataProvider>
    </DarkContext.Provider>
  );
}
