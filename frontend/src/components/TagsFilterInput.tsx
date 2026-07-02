import { useMemo, useRef, useState } from 'react';

interface TagsFilterInputProps {
  value: string;
  availableTags: string[];
  onChange: (value: string | undefined) => void;
}

function parseSelectedTags(value: string): string[] {
  return value
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function TagsFilterInput({ value, availableTags, onChange }: TagsFilterInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedTags = useMemo(() => parseSelectedTags(value), [value]);

  const currentToken = useMemo(() => {
    const parts = value.split(';');
    return parts[parts.length - 1].trim();
  }, [value]);

  const suggestions = useMemo(() => {
    const pool = availableTags.filter((tag) => !selectedTags.includes(tag));
    if (!currentToken) return pool.slice(0, 15);
    const q = currentToken.toLowerCase();
    return pool
      .filter((tag) => tag.toLowerCase().includes(q))
      .slice(0, 15);
  }, [availableTags, currentToken, selectedTags]);

  const applySuggestion = (tag: string) => {
    const lastSep = value.lastIndexOf(';');
    const prefix = lastSep >= 0 ? `${value.slice(0, lastSep + 1)} ` : '';
    const next = `${prefix}${tag}`.trim();
    onChange(next || undefined);
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      applySuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="tags-filter" ref={wrapperRef}>
      <input
        type="text"
        className="tags-filter-input"
        placeholder="Tags (separar por ;)"
        value={value}
        onChange={(e) => {
          onChange(e.target.value || undefined);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="tags-filter-suggestions" role="listbox">
          {suggestions.map((tag, index) => (
            <li key={tag}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applySuggestion(tag)}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
