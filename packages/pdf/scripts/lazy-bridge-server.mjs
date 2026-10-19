import path from "node:path";

const bridgeServerEntry = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../src/extension/plugins/agentBridge/mcp/server.ts",
);

/**
 * Keeps the agent bridge's MCP server out of the extension host bundle: the
 * controller's `import('./server')` becomes a require of the separately built
 * server (`output`, relative to the host bundle). The server carries the MCP
 * SDK and zod, which the host never loads unless the bridge is turned on.
 */
export function lazyBridgeServer(output) {
  return {
    name: "lazy-agent-bridge-server",
    setup(build) {
      build.onResolve({ filter: /^\.\/server$/ }, (args) =>
        path.join(args.resolveDir, "server.ts") === bridgeServerEntry
          ? { path: output, external: true }
          : undefined,
      );
    },
  };
}
