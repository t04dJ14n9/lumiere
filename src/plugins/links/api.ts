import type { Infer } from "../../kernel";
import type { request as requestSchema } from "./protocol";
export type LinkRequest = Infer<typeof requestSchema> & { source: string };
declare module "../../kernel/types" {
  interface Events {
    /** @mode bail */ "links/open": (
      request: LinkRequest,
    ) => Promise<true> | undefined;
    /** @mode bail */ "link/click": (
      request: Infer<typeof requestSchema>,
    ) => true | undefined;
  }
}
