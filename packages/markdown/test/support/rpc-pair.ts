import { Endpoint } from "../../src/shared/rpc/endpoint";
export function rpcPair() {
  let hostReceive = (_value: unknown) => {};
  let clientReceive = (_value: unknown) => {};
  const clock = {
    after(ms: number, callback: () => void) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  };
  const host = new Endpoint(
    {
      send: (value) => clientReceive(value),
      listen: (receive) => {
        hostReceive = receive;
        return () => {};
      },
    },
    clock,
  );
  const client = new Endpoint(
    {
      send: (value) => hostReceive(value),
      listen: (receive) => {
        clientReceive = receive;
        return () => {};
      },
    },
    clock,
  );
  return {
    host,
    client,
    async dispose() {
      await host.dispose();
      await client.dispose();
    },
  };
}
