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
# Mask one allowlisted substring occurrence with same-length placeholders so
# positional coverage is preserved and joined leftovers cannot form a new hit.
mask_token() {
  local text="$1" token="$2"
  local prefix mask
  mask=$(printf '%*s' "${#token}" '' | tr ' ' '#')
  while [[ "$text" == *"$token"* ]]; do
    prefix="${text%%"$token"*}"
    text="${prefix}${mask}${text#"$prefix$token"}"
  done
  printf '%s' "$text"
}
allowed_in_file() {
  local file="$1" line="$2" pat="$3"
  local afile atoken
  local masked="$line"
  while IFS=$'\t' read -r afile atoken; do
    [[ -z "${afile:-}" || "$afile" =~ ^# ]] && continue
    [[ "$afile" == "$file" ]] || continue
    # Exempt only when this allowlisted substring is what justifies the hit.
    [[ "$atoken" == *"$pat"* ]] || continue
    # A substring that is exactly the searched token exempts only a line
    # that is exactly that token. A longer phrase still matches by contains.
    if [[ "$atoken" == "$pat" ]]; then
      if [[ "$line" == "$atoken" ]]; then
        return 0
      fi
      continue
    fi
    [[ "$line" == *"$atoken"* ]] || continue
    # Mask every occurrence of the approved substring. A same-line old token
    # outside those ranges must still fail.
    masked="$(mask_token "$masked" "$atoken")"
  done < "$allowlist"
  # Fail when any searched-token occurrence remains outside masked allowances.
  [[ "$masked" != *"$pat"* ]]
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
