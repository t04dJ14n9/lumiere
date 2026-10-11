#!/usr/bin/env bash
# Sanity checks for a packaged VSIX: size, and no tests, sources, source maps,
# dependencies or secrets inside it.
# Usage: check-vsix.sh <file.vsix> <max size in MB>
set -euo pipefail
vsix=$1
max_mb=$2

size=$(wc -c < "$vsix" | tr -d '[:space:]')
echo "VSIX: $vsix, $((size / 1024)) KB (limit ${max_mb} MB)"
if (( size > max_mb * 1024 * 1024 )); then
  echo "::error file=$vsix::VSIX is $((size / 1024 / 1024)) MB, over the ${max_mb} MB limit"
  exit 1
fi

files=$(unzip -Z1 "$vsix")
echo "$(wc -l <<<"$files") files:"
echo "$files" | sed 's/^/  /'

status=0
# Shipped TypeScript declarations (dist/api/*.d.ts) are fine; other .ts is source.
forbidden='(\.map$|^extension/(src|test|tests|scripts|node_modules|\.github|\.vscode-test)/|\.(test|spec)\.[cm]?[jt]s$|(^|/)\.env|\.(pem|key|p12|pfx)$|(^|/)\.npmrc$|(^|/)id_(rsa|ed25519)|\.vsix$)'
if bad=$(grep -E "$forbidden" <<<"$files"); then
  echo "::error file=$vsix::Files that must not ship:"$'\n'"$bad"
  status=1
fi
if bad=$(grep -E '\.ts$' <<<"$files" | grep -vE '\.d\.ts$'); then
  echo "::error file=$vsix::TypeScript sources in the VSIX:"$'\n'"$bad"
  status=1
fi

# Secret-shaped strings in the packaged files (names only are printed, never matches).
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
unzip -q "$vsix" -d "$workdir"
secrets='(-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|(DEEPSEEK|OPENAI|ANTHROPIC)_API_KEY *[=:] *["'"'"']?[A-Za-z0-9_-]{16,})'
if hits=$(grep -rlE "$secrets" "$workdir"); then
  echo "::error file=$vsix::Secret-shaped strings found in:"$'\n'"${hits//$workdir\//}"
  status=1
fi

exit $status
