#!/usr/bin/env bash
set -euo pipefail
patterns=(
  'markdownWorkbench'
  'vscode-markdown-workbench'
  'MarkdownWorkbench'
  'Markdown Workbench'
  'markdown-workbench'
  't04dj14n9.vscode-markdown-workbench'
)
allowlist="${1:-scripts/identity-rename-allowlist.txt}"
fail=0
allowed_in_file() {
  local file="$1" line="$2" pat="$3"
  local afile atoken
  while IFS=$'\t' read -r afile atoken; do
    [[ -z "${afile:-}" || "$afile" =~ ^# ]] && continue
    [[ "$afile" == "$file" ]] || continue
    [[ "$line" == *"$atoken"* ]] || continue
    # Exempt only when this allowlisted substring is what justifies the hit.
    [[ "$atoken" == *"$pat"* ]] || continue
    # A substring that is exactly the searched token exempts only a line
    # that is exactly that token. A longer phrase still matches by contains.
    if [[ "$atoken" == "$pat" && "$line" != "$atoken" ]]; then
      continue
    fi
    return 0
  done < "$allowlist"
  return 1
}
for p in "${patterns[@]}"; do
  while IFS= read -r hit; do
    file="${hit%%:*}"
    rest="${hit#*:}"
    line="${rest#*:}"   # after line number
    if ! allowed_in_file "$file" "$line" "$p"; then
      echo "B1 HIT: $hit"
      fail=1
    fi
  done < <(git grep -n "$p" || true)
done
exit "$fail"
