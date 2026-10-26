/**
 * Who may use the server: the window it was started for, and nothing else
 * on this machine. A page in any browser can send requests to a loopback
 * port, so every request passes three checks:
 * - the launch token, given once in the URL and then kept in an HttpOnly
 *   cookie (the URL is stripped by a redirect);
 * - the Host header names this server, which a DNS-rebinding page cannot;
 * - a request that has an Origin comes from this server's own origin.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const TOKEN_COOKIE = "lumiere_token";

export type Admission =
  | { readonly kind: "admit" }
  | { readonly kind: "reject"; readonly status: 401 | 403 }
  /** The token was in the URL: keep it in the cookie and drop it from the URL. */
  | {
      readonly kind: "redirect";
      readonly location: string;
      readonly cookie: string;
    };

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function admit(
  req: IncomingMessage,
  server: { readonly token: string; readonly port: number },
): Admission {
  const host = req.headers.host ?? "";
  if (!isOwnHost(host, server.port)) {
    return { kind: "reject", status: 403 };
  }
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) {
    return { kind: "reject", status: 403 };
  }
  const url = new URL(req.url ?? "/", `http://${host}`);
  const given = url.searchParams.get("token");
  if (given !== null) {
    if (!sameSecret(given, server.token)) {
      return { kind: "reject", status: 401 };
    }
    url.searchParams.delete("token");
    return {
      kind: "redirect",
      location: url.pathname + url.search,
      cookie: `${TOKEN_COOKIE}=${server.token}; HttpOnly; SameSite=Strict; Path=/`,
    };
  }
  return sameSecret(readCookie(req, TOKEN_COOKIE), server.token)
    ? { kind: "admit" }
    : { kind: "reject", status: 401 };
}

/** The server's own names: the loopback address it listens on, by any spelling. */
function isOwnHost(host: string, port: number): boolean {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(
    host.toLowerCase(),
  );
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return value.join("=");
    }
  }
  return undefined;
}

function sameSecret(given: string | undefined, token: string): boolean {
  if (given === undefined) {
    return false;
  }
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
