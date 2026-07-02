import type { Article } from '../../types/referencias';

interface ArticleCardProps {
  article: Article;
  onOpen: () => void;
  onToggleUsado: () => void;
  onToggleDescartado: () => void;
}

export function ArticleCard({
  article,
  onOpen,
  onToggleUsado,
  onToggleDescartado,
}: ArticleCardProps) {
  const title = article.entry.fields.title || article.entry.key;
  const author = article.entry.fields.author ?? '';
  const year = article.entry.fields.year ?? '';

  return (
    <article className="mobile-article-card" onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} role="button" tabIndex={0}>
      <div className="mobile-article-card-header">
        <h3>{title}</h3>
        {year && <span className="mobile-article-year">{year}</span>}
      </div>
      {author && <p className="mobile-article-author">{author}</p>}
      <div className="mobile-article-meta">
        <span className={`status-badge status-${article.status}`}>{article.status}</span>
        {article.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="mobile-article-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={article.usado ? 'toggle active' : 'toggle'}
          onClick={onToggleUsado}
        >
          Usado
        </button>
        <button
          type="button"
          className={article.descartado ? 'toggle active danger' : 'toggle'}
          onClick={onToggleDescartado}
        >
          Descartado
        </button>
      </div>
    </article>
  );
}
