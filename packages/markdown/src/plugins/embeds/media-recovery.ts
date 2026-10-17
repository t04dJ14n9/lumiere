import { webmMime, WebmStream } from "./webm-stream";
import { appendWebm, openMediaSource } from "./media-source";

export function mediaRecovery(
  media: HTMLMediaElement,
  url: string,
  failed: (detail: string) => void,
): () => void {
  const recovery = new MediaRecovery(media, url, failed);
  recovery.bind();
  return () => recovery.dispose();
}

class MediaRecovery {
  private readonly abort = new AbortController();
  private attempted = false;
  private objectUrl?: string;
  constructor(
    private readonly media: HTMLMediaElement,
    private readonly url: string,
    private readonly failed: (detail: string) => void,
  ) {}

  bind(): void {
    this.media.addEventListener(
      "error",
      () => {
        if (this.attempted || !/\.webm(?:[?#]|$)/i.test(this.url)) {
          this.report(
            this.media.error?.message ?? "Media could not be decoded.",
          );
          return;
        }
        this.attempted = true;
        void this.recover().catch((error) => {
          this.report(error);
          this.abort.abort();
        });
      },
      { signal: this.abort.signal },
    );
  }

  dispose(): void {
    this.abort.abort();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  private report(error: unknown): void {
    if (!this.abort.signal.aborted) {
      this.failed(String(error));
    }
  }

  private async recover(): Promise<void> {
    const signal = this.abort.signal;
    const response = await fetch(this.url, { signal });
    if (!response.ok || !response.body) {
      throw new Error("Could not read the WebM attachment.");
    }
    const reader = response.body.getReader();
    signal.addEventListener(
      "abort",
      () => {
        void reader.cancel();
      },
      { once: true },
    );
    const { header, mime } = await readWebmHeader(reader);
    if (!MediaSource.isTypeSupported(mime)) {
      throw new Error(`This host cannot decode ${mime}.`);
    }
    if (signal.aborted) {
      return;
    }
    const source = await openMediaSource({
      media: this.media,
      signal,
      objectUrl: (url) => {
        this.objectUrl = url;
      },
    });
    const buffer = source.addSourceBuffer(mime);
    await streamWebm({
      reader,
      header,
      source,
      signal,
      append: (bytes) =>
        appendWebm(bytes, { buffer, media: this.media, signal }),
    });
  }
}

async function readWebmHeader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ header: Uint8Array; mime: string }> {
  let header = new Uint8Array(0);
  let mime: string | undefined;
  while (!mime) {
    const part = await reader.read();
    if (part.done) {
      throw new Error("Incomplete WebM track metadata.");
    }
    const joined = new Uint8Array(header.length + part.value.length);
    joined.set(header);
    joined.set(part.value, header.length);
    header = joined;
    mime = webmMime(header);
    if (!mime && header.length > 1024 * 1024) {
      throw new Error("WebM track metadata exceeds the supported header size.");
    }
  }
  return { header, mime };
}

async function streamWebm({
  reader,
  header,
  source,
  signal,
  append,
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  header: Uint8Array;
  source: MediaSource;
  signal: AbortSignal;
  append(bytes: Uint8Array): Promise<void>;
}): Promise<void> {
  const stream = new WebmStream();
  for (const part of stream.push(header)) {
    await append(part);
  }
  while (!signal.aborted) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    for (const chunk of stream.push(part.value)) {
      await append(chunk);
    }
  }
  if (!signal.aborted && source.readyState === "open") {
    for (const chunk of stream.finish()) {
      await append(chunk);
    }
    source.endOfStream();
  }
}
