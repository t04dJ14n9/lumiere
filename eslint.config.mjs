import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import path from 'node:path';
// Same baseline as PDF Workbench, with architecture boundaries for this project.
const boundaries = {
  meta: { type: 'problem', schema: [], messages: { boundary: 'Import violates the pure layer or plugin boundary: {{source}}' } },
  create(context) {
    const file = context.filename.replaceAll('\\', '/');
    function check(node) {
      if (!node.source) return;
      const source = node.source.value;
      const target = source.startsWith('.') ? path.resolve(path.dirname(file), source).replaceAll('\\', '/') : source;
      const pure = /\/src\/(kernel|shared|markdown)\//.test(file);
      let invalid = pure && (source === 'vscode' || source.startsWith('node:') || /\/src\/(host|webview|plugins|workers)\//.test(target));
      const owner = file.match(/\/src\/plugins\/([^/]+)\//)?.[1];
      if (owner) {
        const other = target.match(/\/src\/plugins\/([^/]+)\/([^/]+)$/);
        invalid ||= Boolean(other && other[1] !== owner && !/^(api|manifest|protocol)(\.ts)?$/.test(other[2]));
        invalid ||= /\/src\/host\//.test(target) && !(target.endsWith('/host/api/types') && node.importKind === 'type');
        invalid ||= /\/src\/webview\//.test(target) && !target.includes('/src/webview/ui/');
      }
      if (invalid) context.report({ node, messageId: 'boundary', data: { source } });
    }
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};
export default tseslint.config(
  { ignores: ['dist/**', '.cache/**', 'test-results/**', 'playwright-report/**', 'artifacts/**'] },
  js.configs.recommended, ...tseslint.configs.recommended,
  { files: ['**/*.ts'], plugins: { architecture: { rules: { boundaries } } }, rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'architecture/boundaries': 'error', eqeqeq: ['error', 'always'],
  } },
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' } } },
);
