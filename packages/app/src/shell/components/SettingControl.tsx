/**
 * The control for one setting, as VS Code's Settings editor draws it: a
 * checkbox, a list, a number or text field, or JSON for arrays and objects.
 * Text is committed on Enter or when the field loses focus; the server checks
 * the value and a refused one shows its reason under the field.
 */
import { useEffect, useState, type KeyboardEvent } from "react";
import type { SettingItem } from "@workshop/host-node/settings";
import { controlFor, enumLabel } from "../settings-view";

export interface SettingControlProps {
  readonly item: SettingItem;
  readonly onChange: (value: unknown) => void;
  /** The id of the element that labels the control. */
  readonly labelId: string;
}

export function SettingControl({
  item,
  onChange,
  labelId,
}: SettingControlProps) {
  const control = controlFor(item.schema);
  if (control === "boolean") {
    return (
      <input
        type="checkbox"
        aria-labelledby={labelId}
        checked={item.value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (control === "enum") {
    return <EnumControl item={item} onChange={onChange} labelId={labelId} />;
  }
  return <TextControl item={item} onChange={onChange} labelId={labelId} />;
}

function EnumControl({ item, onChange, labelId }: SettingControlProps) {
  const values = item.schema.enum ?? [];
  const index = values.findIndex((value) => value === item.value);
  const description = item.schema.enumDescriptions?.[index];
  return (
    <>
      <select
        aria-labelledby={labelId}
        value={String(index)}
        onChange={(event) => onChange(values[Number(event.target.value)])}
      >
        {values.map((value, position) => (
          <option key={String(value)} value={String(position)}>
            {enumLabel(item.schema, position)}
          </option>
        ))}
      </select>
      {description && <p className="setting-hint">{description}</p>}
    </>
  );
}

/** Numbers, strings and JSON: edited as text, committed whole. */
function TextControl({ item, onChange, labelId }: SettingControlProps) {
  const control = controlFor(item.schema);
  const shown =
    control === "json"
      ? JSON.stringify(item.value, null, 2)
      : String(item.value ?? "");
  const [draft, setDraft] = useState(shown);
  const [problem, setProblem] = useState<string>();
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    if (draft === shown) {
      return;
    }
    const parsed = parseDraft(draft, control);
    setProblem(parsed.problem);
    if (!parsed.problem) {
      onChange(parsed.value);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && control !== "json") {
      commit();
    } else if (event.key === "Escape") {
      setDraft(shown);
      setProblem(undefined);
    }
  };
  const common = {
    "aria-labelledby": labelId,
    value: draft,
    onBlur: commit,
    onKeyDown,
  };
  return (
    <>
      {control === "json" ? (
        <textarea
          {...common}
          rows={Math.min(8, draft.split("\n").length + 1)}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <input
          {...common}
          type={control === "string" ? "text" : "number"}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      {problem && <p className="setting-problem">{problem}</p>}
    </>
  );
}

function parseDraft(
  text: string,
  control: string,
): { value?: unknown; problem?: string } {
  if (control === "string") {
    return { value: text };
  }
  if (control === "json") {
    try {
      return { value: JSON.parse(text) as unknown };
    } catch {
      return { problem: "This is not valid JSON." };
    }
  }
  const value = Number(text);
  return text.trim() === "" || !Number.isFinite(value)
    ? { problem: "Enter a number." }
    : { value };
}
