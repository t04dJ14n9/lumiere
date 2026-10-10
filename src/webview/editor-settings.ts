import type { Context, Infer } from "../kernel";
import type { Endpoint } from "../shared/rpc/endpoint";
import type { config as editorConfig } from "../plugins/editor/manifest";
import { protocol } from "../plugins/editor/protocol";

/** The editor plugin's fiber, or anything that reconfigures like one. */
interface Reconfigurable<C> {
  readonly config: C;
  update(config: C): Promise<void>;
}

/**
 * Editor settings from the host. The handler returns the update, so the
 * endpoint counts it as part of applying the notification: a request that
 * arrives after it sees the new settings (R3-6). Never rejects; failures
 * are logged.
 */
export function registerEditorSettings<
  C extends { editor?: Infer<typeof editorConfig> },
>(root: Context, rpc: Endpoint, editor: Reconfigurable<C>): void {
  root.effect(() =>
    rpc.on(protocol, "configureEditor", (settings) =>
      editor
        .update({ ...editor.config, editor: settings })
        .catch((error: unknown) =>
          root.logger.error("Editor settings failed", error),
        ),
    ),
  );
}
