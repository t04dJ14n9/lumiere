/** One setting in the Settings tab: its title, description, control and Reset. */
import type { SettingItem } from "@workshop/host-node/settings";
import { controlFor, descriptionParts } from "../settings-view";
import { SettingControl } from "./SettingControl";

export interface SettingRowProps {
  readonly item: SettingItem;
  /** Why the server refused the last value, if it did. */
  readonly problem: string | undefined;
  readonly onChange: (value: unknown) => void;
  readonly onReset: () => void;
}

export function SettingRow({
  item,
  problem,
  onChange,
  onReset,
}: SettingRowProps) {
  const labelId = `setting-${item.key}`;
  const isCheckbox = controlFor(item.schema) === "boolean";
  return (
    <div className="setting" data-modified={item.modified || undefined}>
      <div className="setting-title" id={labelId}>
        {item.label.prefix}: <strong>{item.label.name}</strong>
        {item.modified && (
          <button
            type="button"
            className="setting-reset"
            title="Reset to the default"
            onClick={onReset}
          >
            Reset
          </button>
        )}
      </div>
      {isCheckbox ? (
        <label className="setting-checkbox">
          <SettingControl item={item} onChange={onChange} labelId={labelId} />
          <Description text={item.description} />
        </label>
      ) : (
        <>
          <Description text={item.description} />
          <div className="setting-control">
            <SettingControl item={item} onChange={onChange} labelId={labelId} />
          </div>
        </>
      )}
      {problem && <p className="setting-problem">{problem}</p>}
      <div className="setting-key">{item.key}</div>
    </div>
  );
}

function Description({ text }: { readonly text: string }) {
  return (
    <span className="setting-description">
      {descriptionParts(text).map((part, index) =>
        part.code ? (
          <code key={index}>{part.text}</code>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}
