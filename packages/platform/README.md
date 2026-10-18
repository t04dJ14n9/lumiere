# @workshop/platform

What the extension needs from where it runs: the desktop, where the
extension host is Node, or the browser (vscode.dev, github.dev), where it is
a web worker. Plugins never test which one they are on; the composition root
builds a `HostPlatform` and hands it down (see
[docs/WEB_BUILD.md](../../docs/WEB_BUILD.md)).

## How it works

`src/` holds the interfaces and pure helpers, which run anywhere (no DOM,
VS Code or Node APIs). Each platform implements the interfaces in its own
folder: `src/node/` for the desktop (exported as `@workshop/platform/node`),
and later `src/web/` for the browser. The composition root
(`src/extension.ts`) calls `nodePlatform(extensionPath)` and passes the result
to both products: Markdown Workshop's host adapters take what they need, and
`providePlatform` publishes the rest as services that plugins inject. A
capability a platform lacks is an absent member, so the plugins that require
it do not start and the ones that use it optionally skip it.

## Files

- `src/services.ts`: `HostPlatform` and its services (`Digests`,
  `RealPaths`, `AgentFiles`, `OperatingSystem`), and `providePlatform`.
- `src/workers.ts`: `WorkerLauncher`, `WorkerChannel` (the host's side of a
  worker) and `WorkerPort` (the worker's side).
- `src/encoding.ts`: base64, base64url and hex as `Buffer` writes them, and a
  constant-time comparison.
- `src/posix-path.ts`: `path.posix` operations on URI paths, and absolute
  paths by platform.
- `src/node/`: the desktop's implementations: worker threads, `node:crypto`
  digests, `fs.realpath` containment, agent files in the system temp folder,
  and `nodeWorkerPort` for the worker bundles' Node entry points.

## Services

`providePlatform` publishes `os` and `digests` always, and `realPaths` and
`agentFiles` where the platform has them (the desktop). The workers are not a
service: Markdown Workshop's host adapters receive the launcher directly.

## Limits

- The helpers match Node only for what the extension uses: absolute URI
  paths, and `Buffer`'s encodings. Their tests pin them to Node's output.
- Digests are synchronous because their callers are; in the browser they
  will be computed in JavaScript, not natively.
