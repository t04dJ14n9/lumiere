import React, { useEffect, useRef, useState } from 'react';

/**
 * A number the reader can type over, such as the page or zoom. An edited
 * value is committed on Enter or when the field loses focus; leaving the
 * field without editing commits nothing, so it never repeats a navigation.
 */
export function NumberField({ label, value, suffix, onCommit }: {
  label: string;
  value: number;
  suffix: string;
  /**
   * Applies the typed value and returns the value actually used (after
   * clamping, say), which the field then shows; or false for input that
   * cannot be used, and the field resets.
   */
  onCommit: (value: number) => number | false;
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const edited = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (): void => {
    if (!edited.current) return;
    edited.current = false;
    const number = Number.parseFloat(draft);
    const used = Number.isFinite(number) ? onCommit(number) : false;
    // Show what was used: a clamped value can equal the current one, and
    // then no new value arrives to replace the draft.
    setDraft(String(used === false ? value : used));
  };

  return (
    <label className="number-field">
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft}
        onChange={event => {
          edited.current = true;
          setDraft(event.currentTarget.value);
        }}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit();
        }}
      />
      <span>{suffix}</span>
    </label>
  );
}
