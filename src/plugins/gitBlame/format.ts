import type { GitBlameOk, GitIdentity } from "../../shared/git-blame";

type GhostBlame = Pick<
  GitBlameOk,
  | "authorName"
  | "authorEmail"
  | "authorDate"
  | "subject"
  | "body"
  | "committerDate"
>;
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const relativeUnits = [
  [31536000, "year"],
  [2592000, "month"],
  [604800, "week"],
  [86400, "day"],
  [3600, "hour"],
  [60, "minute"],
] as const;

const absoluteFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
});

export function formatBlameGhost(
  blame: GhostBlame,
  identity: GitIdentity | undefined,
  now = Date.now() / 1000,
): string {
  const author = authorLabel(blame, identity);
  const relative = relativeTime(blame.authorDate, now);
  const subject = truncateSubject(blame.subject);
  return `${author}, ${relative}${subject ? ` • ${subject}` : ""}`;
}

/**
 * Multi-line hover content: author, relative + absolute time (and committer
 * lag when present), full subject, then the commit body.
 */
export function formatBlameTooltip(
  blame: GhostBlame,
  identity: GitIdentity | undefined,
  now = Date.now() / 1000,
): string {
  const author = authorLabel(blame, identity);
  const relative = relativeTime(blame.authorDate, now);
  const absolute = absoluteFormat.format(new Date(blame.authorDate * 1000));
  let when = `${relative} (${absolute}`;
  if (
    blame.committerDate !== undefined &&
    blame.committerDate > 0 &&
    blame.committerDate !== blame.authorDate
  ) {
    when += `, committed ${relativeTime(blame.committerDate, now)}`;
  }
  when += ")";
  const subject = firstLine(blame.subject);
  const body = (blame.body ?? "").replace(/^\s+|\s+$/gu, "");
  const lines = [author, when];
  if (subject) {
    lines.push(subject);
  }
  if (body) {
    lines.push("", body);
  }
  return lines.join("\n");
}

function authorLabel(
  blame: GhostBlame,
  identity: GitIdentity | undefined,
): string {
  const name = blame.authorName.trim();
  const email = blame.authorEmail.trim();
  const sameEmail =
    email.length > 0 &&
    email.toLowerCase() === identity?.userEmail?.trim().toLowerCase();
  const sameName = name.length > 0 && name === identity?.userName?.trim();
  if (sameEmail || sameName) {
    return "You";
  }
  return name || email.split("@")[0] || "Unknown author";
}

function relativeTime(date: number, now: number): string {
  const elapsed = Math.max(0, now - date);
  for (const [seconds, unit] of relativeUnits) {
    if (elapsed >= seconds) {
      const count = Math.floor(elapsed / seconds);
      return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

function truncateSubject(subject: string): string {
  const line = firstLine(subject);
  const parts = Array.from(graphemes.segment(line), ({ segment }) => segment);
  return parts.length > 48 ? parts.slice(0, 48).join("") + "…" : line;
}

function firstLine(subject: string): string {
  return (subject.split(/[\r\n]/, 1)[0] ?? "").trim();
}
