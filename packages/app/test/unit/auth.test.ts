import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { admit, newToken, TOKEN_COOKIE } from "../../src/server/auth";

const token = "secret-token";
const server = { token, port: 5000 };

function request(
  url: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  return {
    url,
    headers: { host: "127.0.0.1:5000", ...headers },
  } as unknown as IncomingMessage;
}

test("the token in the URL moves into a cookie and out of the URL", () => {
  const result = admit(
    request(`/lumiere/editor?path=%2Fn.md&token=${token}`),
    server,
  );
  assert.equal(result.kind, "redirect");
  if (result.kind === "redirect") {
    assert.equal(result.location, "/lumiere/editor?path=%2Fn.md");
    assert.match(result.cookie, new RegExp(`^${TOKEN_COOKIE}=${token};`));
    assert.match(result.cookie, /HttpOnly/);
    assert.match(result.cookie, /SameSite=Strict/);
  }
});

test("the cookie admits; a wrong or missing token does not", () => {
  assert.equal(
    admit(request("/", { cookie: `a=b; ${TOKEN_COOKIE}=${token}` }), server)
      .kind,
    "admit",
  );
  assert.deepEqual(admit(request("/"), server), {
    kind: "reject",
    status: 401,
  });
  assert.deepEqual(
    admit(request("/", { cookie: `${TOKEN_COOKIE}=nope` }), server),
    {
      kind: "reject",
      status: 401,
    },
  );
  assert.deepEqual(admit(request("/?token=nope"), server), {
    kind: "reject",
    status: 401,
  });
});

test("another Host (DNS rebinding) or another Origin is refused, even with the token", () => {
  const cookie = `${TOKEN_COOKIE}=${token}`;
  assert.deepEqual(
    admit(request("/", { cookie, host: "evil.example:5000" }), server),
    {
      kind: "reject",
      status: 403,
    },
  );
  assert.deepEqual(
    admit(request("/", { cookie, host: "127.0.0.1:5001" }), server),
    {
      kind: "reject",
      status: 403,
    },
  );
  assert.deepEqual(
    admit(
      request("/api/vaults", { cookie, origin: "http://evil.example" }),
      server,
    ),
    { kind: "reject", status: 403 },
  );
  assert.equal(
    admit(
      request("/api/vaults", { cookie, origin: "http://127.0.0.1:5000" }),
      server,
    ).kind,
    "admit",
  );
  assert.equal(
    admit(request("/", { cookie, host: "localhost:5000" }), server).kind,
    "admit",
  );
});

test("tokens are long and different each launch", () => {
  const a = newToken();
  assert.ok(a.length >= 40);
  assert.notEqual(a, newToken());
});
