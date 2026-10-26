import { Component, useEffect, useState, type ReactNode } from 'react';
import { loadDataset } from '../db/db';
import { makeBackup } from '../backup';
import { todayISO } from '../lib/months';

const reload = () => window.location.reload();

/** Baixa um backup direto do banco, sem depender das telas (útil quando algo quebrou). */
async function emergencyBackup() {
  try {
    const blob = new Blob([JSON.stringify(makeBackup(await loadDataset()))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `financas-backup-${todayISO()}.json`;
    a.click();
  } catch (e) {
    alert(`Não consegui ler os dados: ${(e as Error).message}`);
  }
}

/** "Carregando…" que, se demorar, explica e oferece recarregar em vez de ficar parado para sempre. */
export function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="app">
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div className="ico">⏳</div>
        <p>Carregando…</p>
        {slow && (
          <div className="card" style={{ textAlign: 'left' }}>
            <p style={{ marginTop: 0 }}><strong>Está demorando mais que o normal.</strong></p>
            <p className="small muted">Isso costuma acontecer quando o app está se atualizando com a internet lenta. Seus dados continuam guardados no aparelho.</p>
            <button className="btn" onClick={reload}>🔄 Recarregar</button>
            <p className="small muted" style={{ marginBottom: 0 }}>Se continuar, feche o app pela lista de apps recentes e abra de novo.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Se alguma tela der erro, mostra um aviso em vez de tela em branco. */
export class ErrorGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="empty-state" style={{ paddingTop: 60 }}><div className="ico">😕</div></div>
        <div className="card">
          <p style={{ marginTop: 0 }}><strong>Algo deu errado ao abrir esta tela.</strong></p>
          <p className="small muted">Seus dados continuam guardados no aparelho. Tente recarregar; se o erro voltar, baixe um backup por segurança e me mande a mensagem abaixo.</p>
          <button className="btn" onClick={reload}>🔄 Recarregar</button>
          <div style={{ height: 8 }} />
          <button className="btn secondary" onClick={emergencyBackup}>⬇️ Baixar backup dos meus dados</button>
          <p className="small muted" style={{ wordBreak: 'break-word', marginBottom: 0 }}>Erro: {this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
