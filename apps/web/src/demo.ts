/** The notes a first visit opens with, kept in the browser like any vault. */
export const DEMO: Readonly<Record<string, string>> = {
  "Welcome.md": `# Welcome to Lumière

Lumière opens a folder of Markdown notes and shows them as you write:
headings, **bold**, links and lists render in place, and the Markdown
comes back where your cursor is.

This vault lives in your browser. Open a folder of your own from the
files pane, or keep writing here; it stays when you come back.

## Try

- [ ] Follow a link: [[Linking notes]]
- [ ] Open the outline on the right
- [ ] Switch to dark: Settings › Color Theme

> [!tip] Works offline
> Once loaded, Lumière keeps working without a connection.

| Key | Does |
| --- | --- |
| ⌘P | Open a note |
| ⌘, | Settings |

$$e^{i\\pi} + 1 = 0$$
`,
  "Linking notes.md": `# Linking notes

Write \`[[\` and a note's name to link to it: [[Welcome]].
A heading works too: [[Welcome#Try]].

Links that point at a note that does not exist yet look dimmer;
following one creates it, like [[A new idea]].
`,
  "Daily/2026-10-25.md": `# 25 October 2026

- Read about [[Linking notes]]
- Draft the plan

\`\`\`mermaid
flowchart LR
  Idea --> Note --> Link
\`\`\`
`,
};
