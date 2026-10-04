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
  /** Returns false for input that cannot be used; the field then resets. */
  onCommit: (value: number) => boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const edited = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (): void => {
    if (!edited.current) return;
    edited.current = false;
    const number = Number.parseFloat(draft);
    if (!Number.isFinite(number) || !onCommit(number)) setDraft(String(value));
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
