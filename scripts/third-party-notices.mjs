// Writes THIRD_PARTY_NOTICES.md from the licenses of the code the extension
// ships: EmbedPDF (and the PDFium engine it contains), React, the codicons, and
// the MCP SDK and zod that the agent bridge bundles.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const packageDirectory = name => path.join(root, 'node_modules', name);

const sections = [
  ['EmbedPDF (@embedpdf/*)', path.join(packageDirectory('@embedpdf/core'), 'LICENSE')],
  ['EmbedPDF PDFium build (@embedpdf/pdfium)', path.join(packageDirectory('@embedpdf/pdfium'), 'LICENSE')],
  ['PDFium (compiled into pdfium.wasm)', path.join(packageDirectory('@embedpdf/pdfium'), 'LICENSE.pdfium')],
  ['React and React DOM', path.join(packageDirectory('react'), 'LICENSE')],
  ['Codicons font (@vscode/codicons)', path.join(packageDirectory('@vscode/codicons'), 'LICENSE')],
  ['Codicons code (@vscode/codicons)', path.join(packageDirectory('@vscode/codicons'), 'LICENSE-CODE')],
  ['MCP TypeScript SDK (@modelcontextprotocol/sdk), in the agent bridge', path.join(packageDirectory('@modelcontextprotocol/sdk'), 'LICENSE')],
  ['Zod, in the agent bridge', path.join(packageDirectory('zod'), 'LICENSE')],
];

const body = sections
  .map(([title, file]) => `## ${title}\n\n\`\`\`text\n${readFileSync(file, 'utf8').trim()}\n\`\`\``)
  .join('\n\n');
writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), `# Third-party notices\n\nThis extension includes the following software.\n\n${body}\n`);
