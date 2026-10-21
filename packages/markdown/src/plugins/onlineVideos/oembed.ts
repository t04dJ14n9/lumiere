/**
 * oEmbed and Hugging Face model response parsing for card titles/authors.
 * Cover URL allowlists live in `thumbnails.ts`.
 */
import type { VideoDetails } from "./protocol";

/** YouTube / Spotify / SoundCloud / Vimeo / TED oEmbed title, author, duration. */
export function parseOEmbed(body: unknown): VideoDetails {
  if (!isRecord(body)) {
    throw new Error("Unexpected oEmbed response");
  }
  const duration =
    typeof body.duration === "number" &&
    Number.isInteger(body.duration) &&
    body.duration > 0 &&
    body.duration < 1_000_000
      ? body.duration
      : undefined;
  return withoutUndefined({
    title: text(body.title, 300),
    author: text(body.author_name, 100),
    duration,
  });
}

/**
 * Hugging Face model API (`/api/models/{id}`): pipeline tag or model id as
 * title; author from `author` or the owner segment of the id. No cover.
 */
export function parseHuggingFaceModel(body: unknown): VideoDetails {
  if (!isRecord(body)) {
    throw new Error("Unexpected Hugging Face response");
  }
  const modelId =
    text(body.modelId, 200) ?? text(body.id, 200) ?? text(body._id, 200);
  const pipeline = text(body.pipeline_tag, 100);
  const title =
    pipeline && modelId ? `${pipeline} · ${modelId}` : (pipeline ?? modelId);
  return withoutUndefined({
    title,
    author: huggingfaceAuthor(body, modelId),
  });
}

function huggingfaceAuthor(
  body: Record<string, unknown>,
  modelId: string | undefined,
): string | undefined {
  const direct = text(body.author, 100);
  if (direct) {
    return direct;
  }
  const owner = modelId?.includes("/") ? modelId.split("/")[0] : undefined;
  return text(owner, 100);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parsing yields undefined for a missing or invalid field; drop those keys. */
function withoutUndefined(details: {
  [K in keyof VideoDetails]?: VideoDetails[K] | undefined;
}): VideoDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as VideoDetails;
}
