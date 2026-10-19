import type { CancellationToken } from "vscode";
import { CancelToken, type Cancellation } from "../../shared/rpc/lifecycle";
export async function withCancellation<T>(
  token: CancellationToken | undefined,
  run: (token: Cancellation) => Promise<T>,
): Promise<T> {
  const cancellation = new CancelToken();
  const subscription = token?.onCancellationRequested(() =>
    cancellation.cancel(),
  );
  if (token?.isCancellationRequested) {
    cancellation.cancel();
  }
  try {
    return await run(cancellation);
  } finally {
    subscription?.dispose();
  }
}
export function publicCancellation(token: Cancellation): CancellationToken {
  return Object.freeze({
    get isCancellationRequested() {
      return token.cancelled;
    },
    onCancellationRequested: (listener, thisArgs, disposables) => {
      const stop = token.onCancel(() => listener.call(thisArgs, undefined));
      const disposable = {
        dispose: () => {
          void stop();
        },
      };
      disposables?.push(disposable);
      return disposable;
    },
  } satisfies CancellationToken);
}
