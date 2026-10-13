import { fileURLToPath } from "node:url";
import { fuzzSuite } from "./harness";
import { targets } from "./targets/rows";

fuzzSuite(
  fileURLToPath(new URL("./targets/rows.ts", import.meta.url)),
  "rows",
  targets,
);
