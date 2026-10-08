import type { Transport } from '../shared/rpc/endpoint';
// VS Code masks window.parent, but its actual wrapper still has the webview's origin.
export function fromHost(event: MessageEvent<unknown>): boolean {
  return event.source === null || event.source === window || event.origin === window.location.origin;
}
export function webviewTransport(api: { postMessage(message: unknown): void }): Transport {
  return {
    send: message => api.postMessage(message),
    listen(receive) {
      const listener = (event: MessageEvent<unknown>) => { if (fromHost(event)) receive(event.data); };
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
  };
}
