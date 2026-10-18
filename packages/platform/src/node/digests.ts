import { createHash, createHmac } from "node:crypto";
import type { Digests } from "../services";

export const nodeDigests: Digests = {
  sha256: (data) => createHash("sha256").update(data).digest("hex"),
  hmacSha256: (key, data) =>
    createHmac("sha256", key).update(data).digest("hex"),
};
