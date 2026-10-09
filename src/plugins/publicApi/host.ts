import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../vault/api";
/** The native adapter supplies the facade; service reads still obey kernel injection. */
export const publicApiHost: Plugin<{ create(context: Context): void }> = {
  name: "publicApi",
  inject: {
    required: ["workbench", "editors", "selections"],
    optional: ["vaults"],
  },
  apply(ctx, options) {
    options.create(ctx);
  },
};
