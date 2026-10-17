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
  const { provides: search, state } = useSearch(DOCUMENT_ID);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Read when results arrive, without starting a new search on every scroll.
  const latestNavigation = useRef(navigation);
  latestNavigation.current = navigation;

  const reveal = (
    result: SearchResult | undefined,
    deliberate = false,
  ): void => {
    const box = result?.rects[0];
    if (!result || !box) {
      return;
    }
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
  };
  const step = (direction: 1 | -1): void => {
    if (!search) {
      return;
    }
    const index = direction > 0 ? search.nextResult() : search.previousResult();
    reveal(search.getState().results[index], true);
  };

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);

  useEffect(() => {
    if (!search) {
      return;
    }
    let cancelled = false;
    const intent = latestNavigation.current.intent;
    const generation = intent.advance();
    const timer = window.setTimeout(() => {
      if (cancelled || !intent.owns(generation)) {
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
          if (cancelled || !intent.owns(generation)) {
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
  }, [search, query]);

  useEffect(() => () => search?.stopSearch(), [search]);
  useEffect(() => onPreviewEnd, [onPreviewEnd]);

  const count = state.loading
    ? "…"
    : state.total > 0
      ? `${state.activeResultIndex + 1} of ${state.total}`
      : "No results";
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
        {query.trim() ? count : ""}
      </span>
      <button
        type="button"
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        onClick={() => step(-1)}
      >
        <i className="codicon codicon-arrow-up" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Next match"
        title="Next match (Enter)"
        onClick={() => step(1)}
      >
        <i className="codicon codicon-arrow-down" aria-hidden="true" />
      </button>
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
