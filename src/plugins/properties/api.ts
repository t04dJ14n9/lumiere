import type { PropertyTypes } from "../../markdown/properties/types";
declare module "../../kernel/types" {
  interface Events {
    /** @mode emit */ "properties/typesChanged": (
      root: string,
      types: PropertyTypes,
    ) => void;
    /** @mode bail */ "editor/focusTitle": () => true | undefined;
  }
}
