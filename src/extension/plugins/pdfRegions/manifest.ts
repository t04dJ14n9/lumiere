import { defineManifest } from '../../runtime/manifest';

export default defineManifest({
  id: 'pdfRegions',
  title: 'Region Snapshots',
  capabilities: ['storage'],
  requires: ['pdf'],
  provides: ['regions'],
});
