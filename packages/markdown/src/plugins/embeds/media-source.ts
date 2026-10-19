export async function openMediaSource({
  media,
  signal,
  objectUrl,
}: {
  media: HTMLMediaElement;
  signal: AbortSignal;
  objectUrl(url: string): void;
}): Promise<MediaSource> {
  const source = new MediaSource();
  const url = URL.createObjectURL(source);
  objectUrl(url);
  const opened = new Promise<void>((resolve, reject) => {
    source.addEventListener("sourceopen", () => resolve(), {
      once: true,
      signal,
    });
    signal.addEventListener(
      "abort",
      () => reject(new Error("Media view closed.")),
      { once: true },
    );
  });
  media.src = url;
  await opened;
  return source;
}

export function appendWebm(
  bytes: Uint8Array,
  {
    buffer,
    media,
    signal,
  }: {
    buffer: SourceBuffer;
    media: HTMLMediaElement;
    signal: AbortSignal;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): void => {
      clean();
      // Opus preroll may put the first shared audio/video sample just after zero.
      // Start there rather than waiting forever on an unbuffered gap.
      if (
        media.currentTime === 0 &&
        media.buffered.length &&
        media.buffered.start(0) > 0
      ) {
        media.currentTime = media.buffered.start(0);
      }
      resolve();
    };
    const error = (): void => {
      clean();
      reject(new Error("WebM stream decoding failed."));
    };
    const clean = (): void => {
      buffer.removeEventListener("updateend", done);
      buffer.removeEventListener("error", error);
      signal.removeEventListener("abort", error);
    };
    buffer.addEventListener("updateend", done, { once: true });
    buffer.addEventListener("error", error, { once: true });
    signal.addEventListener("abort", error, { once: true });
    try {
      buffer.appendBuffer(bytes as Uint8Array<ArrayBuffer>);
    } catch (cause) {
      clean();
      reject(
        cause instanceof Error
          ? cause
          : new Error("WebM stream could not be appended."),
      );
    }
  });
}
