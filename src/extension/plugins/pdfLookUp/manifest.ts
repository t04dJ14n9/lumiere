import { defineManifest } from '../../runtime/manifest';

export default defineManifest({
  id: 'pdfLookUp',
  title: 'macOS Look Up',
  capabilities: ['commands'],
  requires: ['pdf'],
});
