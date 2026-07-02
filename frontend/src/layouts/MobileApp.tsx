import { useState } from 'react';

import { useActiveWorkspace } from '../hooks/useApi';
import { MobileArticlesView } from '../components/mobile/MobileArticlesView';
import { MobileMoreView } from '../components/mobile/MobileMoreView';
import { MobileSearchView } from '../components/mobile/MobileSearchView';
import { MobileSummaryView } from '../components/mobile/MobileSummaryView';
import { SyncStatusBar } from '../components/mobile/SyncStatusBar';

type MobileTab = 'articles' | 'search' | 'summary' | 'more';

export function MobileApp() {
  const [tab, setTab] = useState<MobileTab>('articles');
  const { data: activeWorkspace } = useActiveWorkspace();

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <h1>Referências</h1>
        {activeWorkspace && <span className="mobile-workspace-name">{activeWorkspace.name}</span>}
        <SyncStatusBar />
      </header>

      <main className="mobile-main">
        {tab === 'articles' && <MobileArticlesView />}
        {tab === 'search' && <MobileSearchView />}
        {tab === 'summary' && <MobileSummaryView />}
        {tab === 'more' && <MobileMoreView />}
      </main>

      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={tab === 'articles' ? 'active' : ''}
          onClick={() => setTab('articles')}
        >
          Artigos
        </button>
        <button
          type="button"
          className={tab === 'search' ? 'active' : ''}
          onClick={() => setTab('search')}
        >
          Busca
        </button>
        <button
          type="button"
          className={tab === 'summary' ? 'active' : ''}
          onClick={() => setTab('summary')}
        >
          Resumo
        </button>
        <button
          type="button"
          className={tab === 'more' ? 'active' : ''}
          onClick={() => setTab('more')}
        >
          Mais
        </button>
      </nav>
    </div>
  );
}
