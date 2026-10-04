import { useSearch } from '@embedpdf/plugin-search/react';
import React, { useEffect, useState } from 'react';
import { DOCUMENT_ID } from './plugins';

/** Wait this long after typing before searching the whole document. */
const SEARCH_DELAY_MS = 150;

/** Find text in the PDF: Enter for the next match, Shift+Enter for the previous. */
export function SearchBar({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { provides: search, state } = useSearch(DOCUMENT_ID);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!search) return;
    const timer = window.setTimeout(() => {
      const text = query.trim();
      if (!text) {
        search.stopSearch();
        return;
      }
      search.startSearch();
      search.searchAllPages(text).wait(() => undefined, () => undefined);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search, query]);

  useEffect(() => () => search?.stopSearch(), [search]);

  const count = state.loading
    ? '…'
    : state.total > 0 ? `${state.activeResultIndex + 1} of ${state.total}` : 'No results';
  return (
    <div className="search-bar" role="search" aria-label="Find in PDF">
      <input
        type="search"
        aria-label="Find in PDF"
        placeholder="Find"
        value={query}
        autoFocus
        onChange={event => setQuery(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && event.shiftKey) search?.previousResult();
          else if (event.key === 'Enter') search?.nextResult();
          else if (event.key === 'Escape') onClose();
        }}
      />
      <span className="search-count" aria-live="polite">{query.trim() ? count : ''}</span>
      <button type="button" aria-label="Previous match" title="Previous match" onClick={() => search?.previousResult()}>↑</button>
      <button type="button" aria-label="Next match" title="Next match" onClick={() => search?.nextResult()}>↓</button>
      <button type="button" aria-label="Close search" title="Close" onClick={onClose}>×</button>
    </div>
  );
}
