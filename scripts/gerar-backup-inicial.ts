/**
 * Gera dados/backup-inicial.json a partir de dados/planilha.xlsx + dados/ajustes.json.
 * Esse arquivo é importado no app (Mais → Backup → Restaurar) no celular.
 *
 * dados/ajustes.json (opcional):
 * {
 *   "pessoas": ["Fulana", "Ciclano"],
 *   "salarios": [{ "aPartirDe": "2026-01", "valor": 3000 }],
 *   "receitas": [{ "data": "2026-11-30", "mes": "2026-12", "descricao": "Bônus", "valor": 1000 }]
 * }
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { importSpreadsheet } from '../src/import/fromSpreadsheet';
import { makeBackup } from '../src/backup';
import { toCents } from '../src/lib/money';
import { monthOf } from '../src/lib/months';
import { ME } from '../src/db/types';
import { idFromName } from '../src/db/defaults';

interface Ajustes {
  /** Pessoas a cadastrar mesmo que ainda não apareçam na planilha. */
  pessoas?: string[];
  salarios?: { aPartirDe: string; valor: number }[];
  receitas?: { data: string; mes?: string; descricao: string; valor: number }[];
}

const { data, counts, warnings } = importSpreadsheet(readFileSync('dados/planilha.xlsx'));
const aj: Ajustes = existsSync('dados/ajustes.json') ? JSON.parse(readFileSync('dados/ajustes.json', 'utf8')) : {};

aj.pessoas?.forEach((name, order) => {
  const existing = data.people.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.order = order;
  else data.people.push({ id: idFromName('p', name), name, order });
});
data.people.sort((a, b) => a.order - b.order).forEach((p, i) => { p.order = i; });

for (const s of aj.salarios ?? []) {
  data.salaries = data.salaries.filter((x) => x.fromMonth !== s.aPartirDe);
  data.salaries.push({ id: `sal-${s.aPartirDe}`, fromMonth: s.aPartirDe, amount: toCents(s.valor) });
}
aj.receitas?.forEach((r, i) => {
  data.transactions.push({
    id: `inc-ajuste-${i}`, kind: 'income', date: r.data, month: r.mes ?? monthOf(r.data),
    description: r.descricao, categoryId: undefined, amount: toCents(r.valor), usedBy: ME, createdAt: Date.now(),
  });
});

writeFileSync('dados/backup-inicial.json', JSON.stringify(makeBackup(data), null, 1));
console.log('Importado:', counts);
if (warnings.length) console.log('Avisos:', warnings);
console.log('Gerado: dados/backup-inicial.json');
