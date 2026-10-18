#!/usr/bin/env bash
# Occurrence-scoped gate for retired Lumière PDF identity tokens.
# A hit is allowed only when that line contains an allowlist substring
# that itself contains the matched token. Mechanism skips are whole-file
# and limited to this gate plus design docs that quote the mapping.
set -euo pipefail

cd "$(dirname "$0")/.."

patterns=(
  'vscodeEmbedPdf'
  'vscode-embedpdf'
  'vscode-embedPDF'
  't04dj14n9.vscode-embedpdf'
  'Agent PDF Viewer'
)
allowlist="${1:-scripts/identity-rename-allowlist.txt}"
# Whole-file skips for mechanical/historical files only (not package.json / src):
mechanism_skips=(
  'scripts/check-identity-rename.sh'
  'scripts/identity-rename-allowlist.txt'
  'docs/superpowers/plans/2026-10-15-complete-pdf-workshop-rename.md'
  'docs/superpowers/specs/2026-10-15-complete-pdf-workshop-rename-design.md'
)
fail=0
allowed_in_file() {
  local file="$1" line="$2" pat="$3"
  local afile atoken
  while IFS=$'\t' read -r afile atoken; do
    [[ -z "${afile:-}" || "$afile" =~ ^# ]] && continue
    [[ "$afile" == "$file" ]] || continue
    [[ "$line" == *"$atoken"* ]] || continue
    [[ "$atoken" == *"$pat"* ]] || continue
    return 0
  done < "$allowlist"
  return 1
}
is_mechanism_skip() {
  local file="$1" s
  for s in "${mechanism_skips[@]}"; do
    [[ "$file" == "$s" ]] && return 0
  done
  return 1
}
for p in "${patterns[@]}"; do
  while IFS= read -r hit; do
    file="${hit%%:*}"
    rest="${hit#*:}"
    line="${rest#*:}"
    if is_mechanism_skip "$file"; then
      continue
    fi
    if ! allowed_in_file "$file" "$line" "$p"; then
      echo "B1 HIT: $hit"
      fail=1
    fi
  done < <(git -c color.ui=never grep -n -F -- "$p" || true)
done
exit "$fail"
