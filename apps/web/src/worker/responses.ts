/** The worker's responses to the routes it answers (shared/routes.ts). */

/** A note's page. Its content security policy is its first tag (note-pages.ts). */
export function pageResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Nothing here: no window of the app has it. */
export function notFound(): Response {
  return new Response(null, { status: 404 });
}
