// @workshop/host-node has no standalone dist. Embedders (packages/dsh and
// packages/app) call buildHostAssets from ./assets.mjs into their own out
// dirs. This script exists so `pnpm --filter @workshop/host-node build`
// matches the other packages and does not fail on a missing file.
