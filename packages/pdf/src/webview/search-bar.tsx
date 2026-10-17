import type { SearchResult } from "@embedpdf/models";
import { useSearch } from "@embedpdf/plugin-search/react";
import React, { useEffect, useRef, useState } from "react";
import type { Navigation } from "./navigation";
import { DOCUMENT_ID } from "./plugins";

/** Wait this long after typing before searching the whole document. */
const SEARCH_DELAY_MS = 150;

/**
 * Find text in the PDF: Enter for the next match, Shift+Enter for the
 * previous. Each new `focusRequest` (Find pressed again) focuses the field
 * and selects its text, as in VS Code's own find widget.
 *
 * A new search starts at the first match on or after the current page, and
 * the viewer scrolls to each match it steps to.
 */
export function SearchBar({
  navigation,
  focusRequest,
  onClose,
  onPreviewEnd,
}: {
  navigation: Navigation;
  focusRequest: number;
  onClose: () => void;
  onPreviewEnd: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { state, step } = useDocumentSearch(query, navigation);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);
  useEffect(() => onPreviewEnd, [onPreviewEnd]);
  return (
    <div className="search-bar" role="search" aria-label="Find in PDF">
      <input
        type="search"
        aria-label="Find in PDF"
        placeholder="Find"
        ref={input}
        value={query}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (!value.trim()) {
            onPreviewEnd();
          }
          setQuery(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            step(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            onClose();
          }
        }}
      />
      <span className="search-count" aria-live="polite">
        {query.trim() ? matchCount(state) : ""}
      </span>
      <SearchButton
        icon="arrow-up"
        label="Previous match"
        keys="Shift+Enter"
        onClick={() => step(-1)}
      />
      <SearchButton
        icon="arrow-down"
        label="Next match"
        keys="Enter"
        onClick={() => step(1)}
      />
      <button
        type="button"
        aria-label="Close search"
        title="Close (Escape)"
        onClick={onClose}
      >
        <i className="codicon codicon-close" aria-hidden="true" />
      </button>
    </div>
  );
}

function SearchButton(props: {
  icon: string;
  label: string;
  keys: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={`${props.label} (${props.keys})`}
      onClick={props.onClick}
    >
      <i className={`codicon codicon-${props.icon}`} aria-hidden="true" />
    </button>
  );
}

function matchCount(state: {
  loading: boolean;
  total: number;
  activeResultIndex: number;
}): string {
  if (state.loading) {
    return "…";
  }
  return state.total > 0
    ? `${state.activeResultIndex + 1} of ${state.total}`
    : "No results";
}

/**
 * Search the whole document a moment after `query` changes, starting at the
 * first match on or after the current page, and step through the matches.
 */
function useDocumentSearch(query: string, navigation: Navigation) {
  const { provides: search, state } = useSearch(DOCUMENT_ID);
  // Read when results arrive, without starting a new search on every scroll.
  const latestNavigation = useRef(navigation);
  latestNavigation.current = navigation;
  const reveal = (
    result: SearchResult | undefined,
    deliberate = false,
  ): void => {
    const box = result?.rects[0];
    if (result && box) {
      latestNavigation.current.reveal(
        result.pageIndex + 1,
        [
          box.origin.x,
          box.origin.y,
          box.origin.x + box.size.width,
          box.origin.y + box.size.height,
        ],
        deliberate,
      );
    }
  };
  useEffect(() => {
    if (!search) {
      return;
    }
    let cancelled = false;
    const intent = latestNavigation.current.intent;
    const generation = intent.advance();
    const isCurrent = () => !cancelled && intent.owns(generation);
    const timer = window.setTimeout(() => {
      if (!isCurrent()) {
        return;
      }
      const text = query.trim();
      if (!text) {
        search.stopSearch();
        return;
      }
      search.startSearch();
      search.searchAllPages(text).wait(
        ({ results }) => {
          if (!isCurrent()) {
            return;
          }
          const fromPage = latestNavigation.current.currentPage - 1;
          const index = Math.max(
            0,
            results.findIndex((result) => result.pageIndex >= fromPage),
          );
          search.goToResult(index);
          reveal(results[index]);
        },
        () => undefined,
      );
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `reveal` reads the latest navigation: only a new query starts a new search.
  }, [search, query]);
  useEffect(() => () => search?.stopSearch(), [search]);
  return {
    state,
    step(direction: 1 | -1): void {
      if (!search) {
        return;
      }
      const index =
        direction > 0 ? search.nextResult() : search.previousResult();
      reveal(search.getState().results[index], true);
    },
  };
}
