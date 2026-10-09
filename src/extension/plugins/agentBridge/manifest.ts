import { defineManifest } from '../../runtime/manifest';

export default defineManifest({
  id: 'agentBridge',
  title: 'Agent Bridge',
  capabilities: ['agentHandoff', 'commands', 'localServer'],
  requires: ['pdf'],
  // Region selections carry their PNG snapshot when region snapshots are on.
  optional: ['pdfRegions'],
  provides: ['handoff'],
});
