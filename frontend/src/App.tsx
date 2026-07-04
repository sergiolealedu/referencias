import { useEffect, useMemo, useState } from 'react';



import { ArticleForm } from './components/ArticleForm';

import { ArticleTable, type PageSize } from './components/ArticleTable';

import { BibtexImportModal } from './components/BibtexImportModal';

import { GroupImportModal } from './components/GroupImportModal';

import { Dashboard } from './components/Dashboard';

import { SettingsModal } from './components/SettingsModal';

import { WorkspaceAccessModal } from './components/WorkspaceAccessModal';

import { UsadoBibtexExportModal } from './components/UsadoBibtexExportModal';

import { FiltersBar } from './components/FiltersBar';

import { GroupSidebar } from './components/GroupSidebar';

import {

  useArticles,

  useArticle,

  useClearGroupArticles,

  useGroup,

  useGroupTags,

  useGroups,

  useSettings,

  useActiveWorkspace,

  useDeviceSession,

} from './hooks/useApi';

import type { ArticleFilters, SortColumn, SortDirection } from './types/referencias';

import { api } from './api/client';

import { downloadGroupExport } from './utils/groupExport';
import { showGlobalSettings } from './utils/platform';



type ArticleTarget = { groupId: number; key: string };

type AppView = 'articles' | 'dashboard';



export default function App() {

  const { data: groups = [] } = useGroups();

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [openTarget, setOpenTarget] = useState<ArticleTarget | null>(null);

  const [showForm, setShowForm] = useState(false);

  const [isNewArticle, setIsNewArticle] = useState(false);

  const [filters, setFilters] = useState<ArticleFilters>({});

  const [page, setPage] = useState(1);

  const [pageSize, setPageSize] = useState<PageSize>(20);

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);

  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [findKey, setFindKey] = useState<string | undefined>();

  const [showImport, setShowImport] = useState(false);

  const [showGroupImport, setShowGroupImport] = useState(false);

  const [exportingGroup, setExportingGroup] = useState(false);

  const [showUsadoExport, setShowUsadoExport] = useState(false);

  const [showWorkspaceAccess, setShowWorkspaceAccess] = useState(false);

  const [showSettings, setShowSettings] = useState(false);

  const [view, setView] = useState<AppView>('articles');



  const { data: settings } = useSettings();

  const { data: activeWorkspace } = useActiveWorkspace();

  const { data: deviceSession } = useDeviceSession();

  const displayGroupId = openTarget?.groupId ?? selectedGroupId;



  useEffect(() => {

    if (groups.length > 0 && selectedGroupId === null) {

      setSelectedGroupId(groups[0].id);

    }

  }, [groups, selectedGroupId]);



  const articleParams = useMemo(

    () => ({

      ...filters,

      page,

      pageSize,

      sortBy: sortColumn ?? undefined,

      sortDir: sortColumn ? sortDirection : undefined,

      findKey,

    }),

    [filters, page, pageSize, sortColumn, sortDirection, findKey],

  );



  const { data: group } = useGroup(displayGroupId);

  const { data: availableTags = [] } = useGroupTags(displayGroupId);

  const clearGroupArticles = useClearGroupArticles(displayGroupId);

  const {

    data: articlesPage,

    isLoading,

    error,

  } = useArticles(displayGroupId, articleParams);



  useEffect(() => {

    if (articlesPage?.foundPage && articlesPage.foundPage !== page) {

      setPage(articlesPage.foundPage);

      setFindKey(undefined);

    }

  }, [articlesPage?.foundPage, page]);



  useEffect(() => {

    setPage(1);

    setFindKey(undefined);

  }, [filters, displayGroupId, pageSize, sortColumn, sortDirection]);



  const formTarget: ArticleTarget | null = isNewArticle

    ? null

    : openTarget ??

      (showForm && selectedGroupId !== null && selectedKey

        ? { groupId: selectedGroupId, key: selectedKey }

        : null);



  const {

    data: formArticle,

    isPending: formPending,

    isFetching: formFetching,

  } = useArticle(formTarget?.groupId ?? null, formTarget?.key ?? null);



  const formArticleReady =

    formTarget !== null &&

    formArticle !== undefined &&

    formArticle.entry.key === formTarget.key;



  const handleSelectGroup = (id: number | null) => {

    setOpenTarget(null);

    setSelectedGroupId(id);

    setSelectedKey(null);

    setShowForm(false);

  };



  const handleSelectArticle = (key: string) => {

    setOpenTarget(null);

    setSelectedKey(key);

    setIsNewArticle(false);

    setShowForm(true);

  };



  const handleNavigateToArticle = (groupId: number, key: string) => {

    setFilters({});

    setSortColumn(null);

    setSortDirection('asc');

    setOpenTarget({ groupId, key });

    setSelectedGroupId(groupId);

    setSelectedKey(key);

    setIsNewArticle(false);

    setShowForm(true);

    setFindKey(key);

  };



  const handleClearGroupArticles = async () => {

    if (!group || group.articleCount === 0) return;

    if (

      !window.confirm(

        `Apagar todos os ${group.articleCount} artigo(s) do grupo "${group.title}"?\n\nO grupo será mantido; esta ação não pode ser desfeita.`,

      )

    ) {

      return;

    }

    try {

      await clearGroupArticles.mutateAsync();

    } catch (err) {

      window.alert(`Não foi possível apagar os artigos: ${(err as Error).message}`);

      return;

    }

    setOpenTarget(null);

    setSelectedKey(null);

    setShowForm(false);

    setIsNewArticle(false);

  };



  const handleExportGroup = async () => {

    if (displayGroupId === null || !group) return;

    setExportingGroup(true);

    try {

      const payload = await api.exportGroup(displayGroupId);

      downloadGroupExport(payload);

    } catch (err) {

      window.alert(`Não foi possível exportar o grupo: ${(err as Error).message}`);

    } finally {

      setExportingGroup(false);

    }

  };



  const resetViewState = () => {

    setSelectedGroupId(null);

    setSelectedKey(null);

    setOpenTarget(null);

    setShowForm(false);

    setFilters({});

  };



  return (

    <div className="app">

      <header className="app-header">

        <div className="app-header-text">

          <h1>Referências — Doutorado</h1>

          <p
            className="subtitle"
            title={showGlobalSettings() ? settings?.sqliteDbPath : undefined}
          >

            Workspace: {activeWorkspace?.name ?? settings?.activeWorkspaceName ?? '…'}

          </p>

        </div>

        <div className="app-header-actions">

          <button

            type="button"

            className="workspace-switcher"

            onClick={() => setShowWorkspaceAccess(true)}

            title="Workspaces, convites e tokens de acesso"

          >

            {activeWorkspace?.name ?? 'Workspace'}

          </button>

          <button

            type="button"

            className={view === 'articles' ? 'active-view' : ''}

            onClick={() => setView('articles')}

          >

            Artigos

          </button>

          <button

            type="button"

            className={view === 'dashboard' ? 'active-view' : ''}

            onClick={() => setView('dashboard')}

          >

            Dashboard

          </button>

          {showGlobalSettings() && deviceSession?.isServerAdmin && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              title="Caminhos globais de banco e PDF (somente administrador)"
            >
              Configuração
            </button>
          )}

          <button

            type="button"

            onClick={() => setShowUsadoExport(true)}

            title="Revisar e exportar entradas usadas de todos os grupos"

          >

            Exportar usados

          </button>

        </div>

      </header>



      <div className="app-body">

        {view === 'dashboard' ? (

          <main className="main-panel dashboard-panel">

            <Dashboard />

          </main>

        ) : (

          <>

            <GroupSidebar selectedId={displayGroupId} onSelect={handleSelectGroup} />



            <main className="main-panel">

              {displayGroupId === null ? (

                <p className="empty-state">Selecione ou crie um grupo.</p>

              ) : (

                <>

                  <div className="panel-header">

                    <div className="panel-header-text">

                      <h2>

                        {group?.title ?? '...'}

                        {group?.versao && (

                          <span className="panel-group-versao">{group.versao}</span>

                        )}

                      </h2>

                    </div>



                    <div className="panel-header-actions">

                      <button

                        type="button"

                        className="danger"

                        onClick={handleClearGroupArticles}

                        disabled={!group?.articleCount || clearGroupArticles.isPending}

                        title="Remove todos os artigos deste grupo"

                      >

                        {clearGroupArticles.isPending ? 'Apagando…' : 'Apagar todos'}

                      </button>

                      <button type="button" onClick={() => setShowImport(true)}>

                        Importar BibTeX

                      </button>

                      <button type="button" onClick={() => setShowGroupImport(true)}>

                        Importar grupo

                      </button>

                      <button

                        type="button"

                        onClick={handleExportGroup}

                        disabled={!group || exportingGroup}

                        title="Exporta metadados e todos os artigos para transferir a outro servidor"

                      >

                        {exportingGroup ? 'Exportando…' : 'Exportar grupo'}

                      </button>

                      <button

                        type="button"

                        className="primary"

                        onClick={() => {

                          setOpenTarget(null);

                          setIsNewArticle(true);

                          setSelectedKey(null);

                          setShowForm(true);

                        }}

                      >

                        + Novo artigo

                      </button>

                    </div>

                  </div>



                  <FiltersBar

                    filters={filters}

                    availableTags={availableTags}

                    onChange={setFilters}

                  />



                  {isLoading && <p>Carregando artigos...</p>}

                  {error && <p className="error">Erro: {(error as Error).message}</p>}



                  {!isLoading && !error && articlesPage && (

                    <ArticleTable

                      groupId={displayGroupId}

                      articles={articlesPage.items}

                      total={articlesPage.total}

                      page={articlesPage.page}

                      pageSize={pageSize}

                      sortColumn={sortColumn}

                      sortDirection={sortDirection}

                      selectedKey={selectedKey}

                      onSelect={handleSelectArticle}

                      onNavigateToArticle={handleNavigateToArticle}

                      onPageChange={setPage}

                      onPageSizeChange={setPageSize}

                      onSortChange={(column, direction) => {

                        setSortColumn(column);

                        setSortDirection(direction);

                      }}

                    />

                  )}

                </>

              )}

            </main>



            {showForm && displayGroupId !== null && (

              isNewArticle ? (

                <ArticleForm

                  key="new"

                  groupId={displayGroupId}

                  article={null}

                  isNew

                  onClose={() => {

                    setShowForm(false);

                    setIsNewArticle(false);

                  }}

                  onSaved={(key) => {

                    setOpenTarget(null);

                    setSelectedKey(key);

                    setIsNewArticle(false);

                    setFindKey(key);

                  }}

                />

              ) : formTarget && (formPending || formFetching || !formArticleReady) ? (

                <aside className="article-form">

                  <p style={{ padding: '1rem' }}>Carregando artigo...</p>

                </aside>

              ) : formTarget && formArticle ? (

                <ArticleForm

                  key={`${formTarget.groupId}-${formTarget.key}`}

                  groupId={formTarget.groupId}

                  article={formArticle}

                  isNew={false}

                  onClose={() => {

                    setShowForm(false);

                    setOpenTarget(null);

                  }}

                  onSaved={(key) => {

                    setOpenTarget(null);

                    setSelectedKey(key);

                    setFindKey(key);

                  }}

                />

              ) : null

            )}



            {showImport && displayGroupId !== null && group && (

              <BibtexImportModal

                groupId={displayGroupId}

                groupTitle={group.title}

                onClose={() => setShowImport(false)}

              />

            )}



            {showGroupImport && (

              <GroupImportModal

                defaultTargetGroupId={displayGroupId}

                onClose={() => setShowGroupImport(false)}

                onImported={(result) => {

                  setSelectedGroupId(result.groupId);

                  setShowGroupImport(false);

                }}

              />

            )}

          </>

        )}

      </div>



      {showUsadoExport && (

        <UsadoBibtexExportModal onClose={() => setShowUsadoExport(false)} />

      )}



      {showGlobalSettings() && showSettings && (

        <SettingsModal

          onClose={() => setShowSettings(false)}

          onSaved={resetViewState}

        />

      )}



      {showWorkspaceAccess && (

        <WorkspaceAccessModal

          onClose={() => setShowWorkspaceAccess(false)}

          onChanged={resetViewState}

        />

      )}

    </div>

  );

}


