import { Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import {
  addCard, addCategory, addPerson, deleteSalary, removeCard, removeCategory, removePerson, saveSalary,
} from '../db/actions';
import { db, loadDataset } from '../db/db';
import type { Dataset, Transaction } from '../db/types';
import { parseBackup } from '../backup';
import { reviewIssues } from '../engine/review';
import { daysSinceBackup, exportBackup, KEY_LAST_BACKUP, KEY_RESTORE_SNAPSHOT, restoreWithSnapshot, undoRestore } from '../lib/backupFile';
import { fmt, parseMoney } from '../lib/money';
import { currentMonth, monthLabel, todayISO } from '../lib/months';
import { useData } from './common';
import { Avatar } from './icons';
import { InstallmentsScreen } from './InstallmentsScreen';
import { RecurringScreen } from './RecurringScreen';
import { KEY_REVIEW_DISMISSED, ReviewScreen } from './ReviewScreen';

export type Theme = 'auto' | 'light' | 'dark';

function Section({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button className="between" style={{ width: '100%', background: 'none', border: 0, padding: 0 }} onClick={() => setOpen(!open)}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{hint && <p className="small muted" style={{ marginTop: 0 }}>{hint}</p>}{children}</div>}
    </div>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState('');
  const go = async () => { if (v.trim()) { await onAdd(v.trim()); setV(''); } };
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <input className="input grow" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button className="btn small" onClick={go}>Adicionar</button>
    </div>
  );
}

const removedMsg = (r: string) => r === 'archived' && alert('Já existe lançamento usando este item, então ele foi arquivado: some das listas, mas o histórico continua certo.');

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function MoreScreen({ theme, setTheme, onEditTx }: { theme: Theme; setTheme: (t: Theme) => void; onEditTx: (t: Transaction) => void }) {
  const data = useData();
  const cards = data.cards.filter((c) => !c.archived).sort((a, b) => a.order - b.order);
  const categories = data.categories.filter((c) => !c.archived).sort((a, b) => a.order - b.order);
  const people = data.people.filter((p) => !p.archived).sort((a, b) => a.order - b.order);
  const salaries = [...data.salaries].sort((a, b) => (a.fromMonth < b.fromMonth ? 1 : -1));
  const goal = data.goals[0];
  const [salMonth, setSalMonth] = useState(currentMonth());
  const [salValue, setSalValue] = useState('');
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState<'installments' | 'recurring' | 'review' | null>(null);
  const lastBackup = useLiveQuery(() => db.meta.get(KEY_LAST_BACKUP), []);
  const snapshot = useLiveQuery(() => db.meta.get(KEY_RESTORE_SNAPSHOT), []);
  const dismissed = useLiveQuery(() => db.meta.get(KEY_REVIEW_DISMISSED), []);
  const issueCount = reviewIssues(data, (dismissed?.value as string[] | undefined) ?? []).length;
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => {}); }, []);
  const backupDays = daysSinceBackup(lastBackup?.value, todayISO());

  if (page) {
    return (
      <>
        <button className="btn small secondary" style={{ marginBottom: 12 }} onClick={() => setPage(null)}>‹ Voltar</button>
        <h2 style={{ margin: '0 0 12px' }}>{page === 'installments' ? 'Parcelamentos' : page === 'recurring' ? 'Fixos e assinaturas' : '🔎 Revisar lançamentos'}</h2>
        {page === 'installments' && <InstallmentsScreen />}
        {page === 'recurring' && <RecurringScreen />}
        {page === 'review' && <ReviewScreen onEditTx={onEditTx} />}
      </>
    );
  }

  async function restore(d: Dataset, what: string) {
    const n = (await db.transactions.count()) + (await db.installments.count());
    if (n > 0 && !confirm(`Isto SUBSTITUI todos os dados atuais (${n} lançamentos/parcelamentos) pelos do arquivo. Continuar?`)) return;
    await restoreWithSnapshot(d);
    setMsg(`${what} carregado: ${d.transactions.length} lançamentos, ${d.installments.length} parcelamentos, ${d.recurring.length} fixos.`);
  }

  return (
    <>
      <div className="card" style={{ padding: '4px 14px' }}>
        <div className="list">
          <button className="item" onClick={() => setPage('installments')}>
            <Avatar icon="📆" color="var(--accent)" />
            <span className="grow"><strong>Parcelamentos</strong><br /><span className="small muted">{data.installments.length} {data.installments.length === 1 ? 'compra' : 'compras'} · parcelas por mês</span></span><span className="muted">›</span>
          </button>
          <button className="item" onClick={() => setPage('recurring')}>
            <Avatar icon="🔁" color="var(--accent)" />
            <span className="grow"><strong>Fixos e assinaturas</strong><br /><span className="small muted">{data.recurring.length} cadastrados · boletos, contas, streaming</span></span><span className="muted">›</span>
          </button>
          <button className="item" onClick={() => setPage('review')}>
            <Avatar icon="🔎" color="var(--accent)" />
            <span className="grow"><strong>Revisar lançamentos</strong><br /><span className="small muted">{issueCount ? `${issueCount} para conferir` : 'Nada suspeito'}</span></span><span className="muted">›</span>
          </button>
        </div>
      </div>

      <div className="hint">
        Tudo fica guardado só neste aparelho. {backupDays === null ? 'Nenhum backup registrado ainda.' : backupDays === 0 ? 'Último backup: hoje.' : `Último backup: há ${backupDays} dia(s).`}
      </div>

      <Section title="Aparência" hint="“Automático” segue o tema do celular. Você também pode alternar a qualquer momento pelo botão no topo da tela.">
        <div className="seg" style={{ marginBottom: 0 }}>
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
              {t === 'auto' ? 'Automático' : t === 'light' ? 'Claro' : 'Escuro'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Cartões" hint="O dia de fechamento serve para o app sugerir em qual fatura cada compra cai.">
        <div className="list">
          {cards.map((c) => (
            <div key={c.id} className="item">
              <input type="color" value={c.color} onChange={(e) => db.cards.update(c.id, { color: e.target.value })} style={{ width: 32, height: 32, border: 0, background: 'none', padding: 0 }} aria-label="Cor" />
              <input className="input grow" value={c.name} onChange={(e) => db.cards.update(c.id, { name: e.target.value })} aria-label="Nome do cartão" />
              <label className="small muted" style={{ textAlign: 'center' }}>fecha
                <input className="input" style={{ width: 58, padding: '8px 6px', textAlign: 'center' }} inputMode="numeric" value={c.closingDay ?? ''}
                  onChange={(e) => db.cards.update(c.id, { closingDay: Number(e.target.value) || undefined })} aria-label="Dia de fechamento" />
              </label>
              <button className="icon-btn" aria-label="Remover" onClick={async () => confirm(`Remover ${c.name}?`) && removedMsg(await removeCard(c.id))}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
        <AddRow placeholder="Novo cartão (ex: Inter)" onAdd={(n) => addCard(n)} />
      </Section>

      <Section title="Categorias">
        <div className="list">
          {categories.map((c) => (
            <div key={c.id} className="item">
              <input className="input" style={{ width: 52, textAlign: 'center', padding: '8px 4px' }} value={c.icon} onChange={(e) => db.categories.update(c.id, { icon: e.target.value })} aria-label="Ícone" />
              <input className="input grow" value={c.name} onChange={(e) => db.categories.update(c.id, { name: e.target.value })} aria-label="Nome da categoria" />
              <input type="color" value={c.color} onChange={(e) => db.categories.update(c.id, { color: e.target.value })} style={{ width: 32, height: 32, border: 0, background: 'none', padding: 0 }} aria-label="Cor" />
              <button className="icon-btn" aria-label="Remover" onClick={async () => confirm(`Remover ${c.name}?`) && removedMsg(await removeCategory(c.id))}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
        <AddRow placeholder="Nova categoria (ex: Educação)" onAdd={(n) => addCategory(n)} />
      </Section>

      <Section title="Pessoas que usam meus cartões">
        <div className="list">
          {people.map((p) => (
            <div key={p.id} className="item">
              <input className="input grow" value={p.name} onChange={(e) => db.people.update(p.id, { name: e.target.value })} aria-label="Nome" />
              <button className="icon-btn" aria-label="Remover" onClick={async () => confirm(`Remover ${p.name}?`) && removedMsg(await removePerson(p.id))}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
        <AddRow placeholder="Nova pessoa" onAdd={(n) => addPerson(n)} />
      </Section>

      <Section title="Salário por mês" hint="O salário vale a partir do mês indicado até a próxima mudança. Receitas pontuais (13º, bônus, honorários) você lança pelo botão + como “Receita”.">
        <div className="list">
          {salaries.map((s) => (
            <div key={s.id} className="item">
              <span className="grow">A partir de <strong>{monthLabel(s.fromMonth)}</strong></span>
              <span className="num">{fmt(s.amount)}</span>
              <button className="icon-btn" aria-label="Remover" onClick={() => confirm('Remover esta mudança de salário?') && deleteSalary(s.id)}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" type="month" value={salMonth} onChange={(e) => setSalMonth(e.target.value)} style={{ width: 150 }} aria-label="A partir de" />
          <input className="input grow" inputMode="decimal" placeholder="Salário líquido" value={salValue} onChange={(e) => setSalValue(e.target.value)} />
          <button className="btn small" onClick={async () => {
            const v = parseMoney(salValue);
            if (v === null) return;
            const same = data.salaries.find((s) => s.fromMonth === salMonth);
            await saveSalary({ id: same?.id, fromMonth: salMonth, amount: v });
            setSalValue('');
          }}>Salvar</button>
        </div>
      </Section>

      <Section title="Meta de viagem">
        <div className="field">
          <label>Destino</label>
          <input className="input" value={goal?.destination ?? ''} onChange={(e) => db.goals.put({ id: 'main', target: goal?.target ?? 0, destination: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Valor da meta (R$)</label>
          <input className="input" inputMode="decimal" defaultValue={goal ? (goal.target / 100).toFixed(2).replace('.', ',') : ''}
            onBlur={(e) => db.goals.put({ id: 'main', destination: goal?.destination ?? '', target: parseMoney(e.target.value) ?? 0 })} />
        </div>
      </Section>

      <Section title="Backup e importação" defaultOpen={data.transactions.length === 0}>
        <div className="list">
          <button className="btn" onClick={async () => {
            try {
              const r = await exportBackup();
              if (r !== 'cancelled') setMsg(r === 'shared' ? 'Backup enviado.' : 'Backup baixado. Guarde o arquivo fora do celular.');
            } catch (e) { setMsg(`Não consegui exportar: ${(e as Error).message}`); }
          }}>Fazer backup</button>
          <p className="small muted">
            Abre o menu de compartilhar: escolha o Drive. Serve para trocar de celular.
            {persisted === false && ' O navegador ainda não garantiu estes dados contra limpeza automática, então o backup é ainda mais importante.'}
          </p>
          <button className="btn secondary" onClick={async () => {
            const { exportExcel } = await import('../export/toExcel');
            download(`financas-${todayISO()}.xlsx`, exportExcel(await loadDataset()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          }}>Exportar para Excel (.xlsx)</button>
          <p className="small muted">Planilha só para consulta (lançamentos, parcelas, fixos, histórico e terceiros). Para restaurar, use o backup.</p>
          <button className="btn secondary" onClick={async () => {
            const f = await pickFile('application/json,text/plain,.json,.txt');
            if (!f) return;
            try { await restore(parseBackup(await f.text()), 'Backup'); } catch (e) { setMsg(`${(e as Error).message}`); }
          }}>Restaurar backup</button>
          {snapshot && (
            <>
              <div style={{ height: 8 }} />
              <button className="btn secondary" onClick={async () => {
                if (!confirm('Voltar para os dados de antes da última restauração?')) return;
                setMsg(await undoRestore() ? 'Restauração desfeita.' : 'Não há o que desfazer.');
              }}>Desfazer a última restauração ({(snapshot.value as { at: string }).at.split('-').reverse().join('/')})</button>
            </>
          )}
          <div style={{ height: 8 }} />
          <button className="btn secondary" onClick={async () => {
            const f = await pickFile('.xlsx');
            if (!f) return;
            try {
              // O leitor de Excel é grande; só é baixado quando usado.
              const { importSpreadsheet } = await import('../import/fromSpreadsheet');
              const r = importSpreadsheet(new Uint8Array(await f.arrayBuffer()));
              await restore(r.data, 'Planilha');
              if (r.warnings.length) setMsg((m) => `${m}\n${r.warnings.join('\n')}`);
            } catch (e) { setMsg(`Não consegui ler a planilha: ${(e as Error).message}`); }
          }}>Importar da planilha antiga (.xlsx)</button>
        </div>
        {msg && <p className="small" style={{ whiteSpace: 'pre-line' }}>{msg}</p>}
      </Section>

      <p className="small muted" style={{ textAlign: 'center' }}>Controle Financeiro · v1.4.1</p>
    </>
  );
}
