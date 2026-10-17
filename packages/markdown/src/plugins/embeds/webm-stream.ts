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
        completeClusterBoundary(joined, item, final);
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
        const cluster = orderedCluster(joined, item, at);
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

function completeClusterBoundary(
  joined: Uint8Array,
  item: ElementHeader,
  final: boolean,
): void {
  let boundary = item.body;
  while (boundary < joined.length) {
    const child = elementAt(joined, boundary);
    if (!child) {
      break;
    }
    if (
      [
        0x1f43b675, 0x1c53bb6b, 0x1549a966, 0x1654ae6b, 0x114d9b74, 0x1254c367,
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
}

function orderedCluster(
  joined: Uint8Array,
  item: ElementHeader,
  at: number,
): Uint8Array {
  const children = entries(joined, item.body, item.end);
  const blocks = children.filter(
    (child) => child.id === 0xa3 || child.id === 0xa0,
  );
  blocks.sort((a, b) => blockTime(joined, a) - blockTime(joined, b));
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
  return cluster;
}

function blockTime(joined: Uint8Array, block: ElementHeader): number {
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
}
