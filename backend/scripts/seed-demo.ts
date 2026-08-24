/**
 * Popula um banco descartável com fatores de cada polaridade (só positivos,
 * mistos, só negativos, sem ocorrência), para conferir a tela de Fatores sem
 * tocar no corpus real.
 *
 * Existe porque o único jeito de olhar a tela era usar o banco de verdade, com
 * o dispositivo de verdade. Junto com REGISTRY_DB_PATH e WORKSPACES_CONFIG_PATH
 * dá uma instância inteira descartável, que nasce pedindo o token de primeiro
 * acesso — o fluxo real, sem credencial real.
 *
 *   DEMO=/tmp/demo
 *   SQLITE_DB_PATH=$DEMO/referencias.db npm run seed:demo -w backend
 *
 *   PORT=3002 SQLITE_DB_PATH=$DEMO/referencias.db  *     REGISTRY_DB_PATH=$DEMO/registry.db  *     WORKSPACES_CONFIG_PATH=$DEMO/workspaces.json  *     npx tsx src/server.ts
 *
 *   # noutro terminal, apontando a SPA para essa API:
 *   VITE_API_BASE_URL=http://localhost:3002/api npx vite --port 5174
 *
 * O token de primeiro acesso sai no log da API.
 */
import { SqliteStore } from '../src/store/sqliteStore.js';

const destino = process.env.SQLITE_DB_PATH;
if (!destino) {
  console.error('Defina SQLITE_DB_PATH para o banco descartável.');
  process.exit(2);
}

const store = new SqliteStore(destino);
const grupo = await store.createGroup({ title: 'Amostra', versao: 'v2' });

type Fator = { label: string; polarity: 'positive' | 'negative'; category: string };

const artigos: Array<{ key: string; titulo: string; fatores: Fator[] }> = [
  {
    key: 'silva2024',
    titulo: 'Autonomy and workload in agile teams',
    fatores: [
      { label: 'Autonomia', polarity: 'positive', category: 'Individual' },
      { label: 'Carga de trabalho', polarity: 'negative', category: 'Tarefa e carga de trabalho' },
      { label: 'Home office', polarity: 'positive', category: 'Organizacional' },
    ],
  },
  {
    key: 'souza2023',
    titulo: 'Remote work trade-offs for developers',
    fatores: [
      { label: 'Autonomia', polarity: 'positive', category: 'Individual' },
      { label: 'Home office', polarity: 'negative', category: 'Organizacional' },
      { label: 'Interrupções', polarity: 'negative', category: 'Processo de desenvolvimento' },
    ],
  },
  {
    key: 'lima2022',
    titulo: 'Tooling friction and developer satisfaction',
    fatores: [
      { label: 'Ferramentas', polarity: 'negative', category: 'Técnico e ferramentas' },
      { label: 'Reconhecimento', polarity: 'positive', category: 'Equipe e relações' },
      { label: 'Interrupções', polarity: 'negative', category: 'Processo de desenvolvimento' },
    ],
  },
  {
    key: 'costa2021',
    titulo: 'Peer recognition in distributed teams',
    fatores: [
      { label: 'Reconhecimento', polarity: 'positive', category: 'Equipe e relações' },
      { label: 'Equipe', polarity: 'positive', category: 'Equipe e relações' },
    ],
  },
];

for (const artigo of artigos) {
  await store.createArticle(grupo.id, {
    entry: {
      type: 'article',
      key: artigo.key,
      fields: { title: artigo.titulo, author: 'Autor Exemplo', year: '2024' },
    },
    status: '',
    source: 'seed',
    location: '',
    caminho: '',
    notes: '',
    tags: [],
    descartado: false,
    usado: true,
    revisaoLiteratura: false,
    pdfNaoEncontrado: false,
    motivoDescarte: null,
    factors: artigo.fatores.map((f) => ({
      label: f.label,
      polarity: f.polarity,
      description: `Seção 4.1: “trecho sobre ${f.label.toLowerCase()}”.`,
    })),
  });
}

// Um fator no catálogo sem nenhuma ocorrência, para a seção "Sem ocorrência".
await store.ensureFactor({ name: 'Salário', aliases: ['salary'], category: 'Organizacional' });

const overviews = await store.listFactorOverviews();
for (const f of overviews) {
  console.log(`${f.name}: +${f.positiveCount} / -${f.negativeCount} (${f.articleCount} artigos)`);
}
store.close();
