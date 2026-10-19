import { fileURLToPath } from "node:url";
import { fuzzSuite } from "./harness";
import { targets } from "./targets/diff";

fuzzSuite(
  fileURLToPath(new URL("./targets/diff.ts", import.meta.url)),
  "diff",
  targets,
);
