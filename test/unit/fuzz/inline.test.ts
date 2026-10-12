import { fileURLToPath } from "node:url";
import { fuzzSuite } from "./harness";
import { targets } from "./targets/inline";

fuzzSuite(
  fileURLToPath(new URL("./targets/inline.ts", import.meta.url)),
  "inline",
  targets,
);
