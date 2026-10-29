/**
 * Notes' pages, served by the service worker at `lumiere/page/<id>` while
 * their tabs are open, rather than as blob: documents. Chromium does not put
 * a blob: page under the window's service worker, so the page's requests
 * (the editor's files, a note's images) would go to the network, where
 * nothing answers a note's images and nothing at all answers offline. A page
 * the worker serves is under it in every browser.
 *
 * A blob: document keeps the window's content security policy. A served page
 * gets that policy as its first tag, so the same policy holds it.
 */
import type { ServedPage } from "@workshop/host-web";
import { pageUrl } from "./shared/routes";

export interface NotePagesOptions {
  /** The app's address: the worker's scope. */
  readonly base: string;
  /** The window's content security policy. */
  readonly policy: string;
  /** Whether a service worker answers this window's requests now. */
  readonly isServed: () => boolean;
}

export class NotePages {
  private readonly pages = new Map<string, string>();

  constructor(private readonly options: NotePagesOptions) {}

  /** Serve `html` until its tab closes; undefined when no worker would answer. */
  serve(html: string): ServedPage | undefined {
    const page = withPolicy(html, this.options.policy);
    if (!page || !this.options.isServed()) {
      return undefined;
    }
    const id = randomId();
    this.pages.set(id, page);
    return {
      url: pageUrl(this.options.base, id),
      dispose: () => {
        this.pages.delete(id);
      },
    };
  }

  /** The page served as `id`, while its tab is open. */
  html(id: string): string | undefined {
    return this.pages.get(id);
  }
}

/** `html` with `policy` before anything else, or undefined if it has no head. */
function withPolicy(html: string, policy: string): string | undefined {
  if (!html.includes("<head>")) {
    return undefined;
  }
  const tag = `<meta http-equiv="Content-Security-Policy" content="${escape(policy)}">`;
  return html.replace("<head>", `<head>${tag}`);
}

/** 128 random bits, as hex: a page's address is not guessable. */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}
