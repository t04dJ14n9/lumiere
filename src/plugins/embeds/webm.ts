interface ElementHeader {
  id: number;
  start: number;
  body: number;
  end: number;
}
function vint(
  bytes: Uint8Array,
  at: number,
  id = false,
): [number, number] | undefined {
  const first = bytes[at];
  if (!first) {
    return;
  }
  let length = 1;
  let mask = 128;
  while (!(first & mask) && length <= 8) {
    length++;
    mask >>= 1;
  }
  if (length > 8 || at + length > bytes.length) {
    return;
  }
  let value = id ? first : first & (mask - 1);
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[at + i]!;
  }
  if (!id && value === 2 ** (7 * length) - 1) {
    value = Infinity;
  }
  return [value, length];
}
function elementAt(bytes: Uint8Array, at: number): ElementHeader | undefined {
  const id = vint(bytes, at, true);
  if (!id) {
    return;
  }
  const size = vint(bytes, at + id[1]);
  if (!size) {
    return;
  }
  const body = at + id[1] + size[1];
  return { id: id[0], start: at, body, end: body + size[0] };
}
function entries(
  bytes: Uint8Array,
  from: number,
  end: number,
): ElementHeader[] {
  const result = [];
  while (from < end) {
    const item = elementAt(bytes, from);
    if (!item) {
      break;
    }
    result.push(item);
    if (item.end > end) {
      break;
    }
    from = item.end;
  }
  return result;
}
// Read TrackEntry CodecID fields, rather than guessing codecs from the filename.
export function webmMime(bytes: Uint8Array): string | undefined {
  const segment = entries(bytes, 0, bytes.length).find(
    (item) => item.id === 0x18538067,
  );
  if (!segment) {
    return;
  }
  const tracks = entries(
    bytes,
    segment.body,
    Math.min(segment.end, bytes.length),
  ).find((item) => item.id === 0x1654ae6b);
  if (!tracks || tracks.end > bytes.length) {
    return;
  }
  const codecs: string[] = [];
  const known: Record<string, string> = {
    V_VP8: "vp8",
    V_VP9: "vp9",
    A_OPUS: "opus",
    A_VORBIS: "vorbis",
  };
  for (const track of entries(bytes, tracks.body, tracks.end).filter(
    (item) => item.id === 0xae,
  )) {
    const codec = entries(bytes, track.body, track.end).find(
      (item) => item.id === 0x86,
    );
    if (!codec) {
      continue;
    }
    const name = new TextDecoder().decode(
      bytes.subarray(codec.body, codec.end),
    );
    if (!known[name]) {
      throw new Error(`Unsupported WebM track: ${name}`);
    }
    codecs.push(known[name]);
  }
  if (!codecs.length) {
    throw new Error("WebM has no supported media tracks.");
  }
  return `video/webm; codecs="${codecs.join(",")}"`;
}

// MSE requires monotonically ordered block timecodes across tracks. File muxers
// may order by presentation time after codec delay instead. Reorder whole blocks
// inside each cluster without changing their encoded samples or timestamps.
export class WebmStream {
  private pending = new Uint8Array(0);
  private segment = false;
  push(bytes: Uint8Array, final = false): Uint8Array[] {
    const joined = new Uint8Array(this.pending.length + bytes.length);
    joined.set(this.pending);
    joined.set(bytes, this.pending.length);
    this.pending = joined;
    const output: Uint8Array[] = [];
    let at = 0;
    while (at < joined.length) {
      const item = elementAt(joined, at);
      if (!item) {
        break;
      }
      if (!this.segment && item.id === 0x18538067) {
        output.push(joined.slice(at, item.body));
        at = item.body;
        this.segment = true;
        continue;
      }
      if (!Number.isFinite(item.end) && item.id === 0x1f43b675) {
        let boundary = item.body;
        while (boundary < joined.length) {
          const child = elementAt(joined, boundary);
          if (!child) {
            break;
          }
          if (
            [
              0x1f43b675, 0x1c53bb6b, 0x1549a966, 0x1654ae6b, 0x114d9b74,
              0x1254c367,
            ].includes(child.id)
          ) {
            item.end = boundary;
            break;
          }
          if (!Number.isFinite(child.end)) {
            throw new Error("Invalid unknown-size WebM child.");
          }
          if (child.end > joined.length) {
            break;
          }
          boundary = child.end;
        }
        if (!Number.isFinite(item.end) && final && boundary === joined.length) {
          item.end = joined.length;
        }
        if (!Number.isFinite(item.end)) {
          break;
        }
      }
      if (!Number.isFinite(item.end)) {
        throw new Error("Invalid unknown-size WebM element.");
      }
      if (item.end > joined.length) {
        break;
      }
      if (this.segment && item.id === 0x1f43b675) {
        const children = entries(joined, item.body, item.end);
        const blocks = children.filter(
          (child) => child.id === 0xa3 || child.id === 0xa0,
        );
        const time = (block: ElementHeader): number => {
          const data =
            block.id === 0xa0
              ? entries(joined, block.body, block.end).find(
                  (child) => child.id === 0xa1,
                )
              : block;
          if (!data) {
            throw new Error("Invalid WebM block group.");
          }
          const track = vint(joined, data.body);
          if (!track || data.body + track[1] + 2 > data.end) {
            throw new Error("Invalid WebM block.");
          }
          const offset = data.body + track[1];
          const value = joined[offset]! * 256 + joined[offset + 1]!;
          return value >= 32768 ? value - 65536 : value;
        };
        blocks.sort((a, b) => time(a) - time(b));
        let index = 0;
        const cluster = new Uint8Array(item.end - at);
        cluster.set(joined.subarray(at, item.body));
        let written = item.body - at;
        for (const child of children) {
          const ordered =
            child.id === 0xa3 || child.id === 0xa0 ? blocks[index++]! : child;
          cluster.set(joined.subarray(ordered.start, ordered.end), written);
          written += ordered.end - ordered.start;
        }
        output.push(cluster);
      } else {
        output.push(joined.slice(at, item.end));
      }
      at = item.end;
    }
    this.pending = joined.slice(at);
    return output;
  }
  finish(): Uint8Array[] {
    const output = this.push(new Uint8Array(0), true);
    if (this.pending.length) {
      throw new Error("Truncated WebM element.");
    }
    return output;
  }
}

export function mediaRecovery(
  media: HTMLMediaElement,
  url: string,
  failed: (detail: string) => void,
): () => void {
  const abort = new AbortController();
  let attempted = false;
  let objectUrl: string | undefined;
  const report = (error: unknown): void => {
    if (!abort.signal.aborted) {
      failed(String(error));
    }
  };
  media.addEventListener(
    "error",
    () => {
      if (attempted || !/\.webm(?:[?#]|$)/i.test(url)) {
        report(media.error?.message ?? "Media could not be decoded.");
        return;
      }
      attempted = true;
      void (async () => {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok || !response.body) {
          throw new Error("Could not read the WebM attachment.");
        }
        const reader = response.body.getReader();
        abort.signal.addEventListener(
          "abort",
          () => {
            void reader.cancel();
          },
          { once: true },
        );
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
            throw new Error(
              "WebM track metadata exceeds the supported header size.",
            );
          }
        }
        if (!MediaSource.isTypeSupported(mime)) {
          throw new Error(`This host cannot decode ${mime}.`);
        }
        if (abort.signal.aborted) {
          return;
        }
        const source = new MediaSource();
        objectUrl = URL.createObjectURL(source);
        const opened = new Promise<void>((resolve, reject) => {
          source.addEventListener("sourceopen", () => resolve(), {
            once: true,
            signal: abort.signal,
          });
          abort.signal.addEventListener(
            "abort",
            () => reject(new Error("Media view closed.")),
            { once: true },
          );
        });
        media.src = objectUrl;
        await opened;
        const buffer = source.addSourceBuffer(mime);
        const append = (bytes: Uint8Array): Promise<void> =>
          new Promise((resolve, reject) => {
            const done = (): void => {
              clean();
              // Opus preroll can put the first common audio/video sample just after
              // zero. Start there instead of waiting forever on an unbuffered gap.
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
              abort.signal.removeEventListener("abort", error);
            };
            buffer.addEventListener("updateend", done, { once: true });
            buffer.addEventListener("error", error, { once: true });
            abort.signal.addEventListener("abort", error, { once: true });
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
        const stream = new WebmStream();
        for (const part of stream.push(header)) {
          await append(part);
        }
        while (!abort.signal.aborted) {
          const part = await reader.read();
          if (part.done) {
            break;
          }
          for (const chunk of stream.push(part.value)) {
            await append(chunk);
          }
        }
        if (!abort.signal.aborted && source.readyState === "open") {
          for (const chunk of stream.finish()) {
            await append(chunk);
          }
          source.endOfStream();
        }
      })().catch((error) => {
        report(error);
        abort.abort();
      });
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}
