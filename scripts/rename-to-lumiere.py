"""Rename the Workshop extension to Lumière in a checkout (run from its root).

Idempotent: running it twice changes nothing more. History and frozen files
are left as they are; see EXCLUDE.
"""

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

EXCLUDE_EXACT = {
    "packages/markdown/IMPLEMENTATION_PLAN.md",
    "packages/pdf/IMPLEMENTATION_PLAN.md",
    "docs/HANDOFF_CURSOR_TESTING.md",
    "packages/markdown/scripts/identity-rename-allowlist.txt",
    "packages/markdown/scripts/check-identity-rename.sh",
    "THIRD_PARTY_NOTICES.md",
    "pnpm-lock.yaml",
    "scripts/rename-to-lumiere.py",
}
EXCLUDE_PREFIX = (
    "packages/markdown/test/fixtures/vault/",
    "packages/markdown/docs/obsidian-measurements/",
    "docs/superpowers/",
    "packages/markdown/docs/superpowers/",
)
EXCLUDE_NAME = {"CHANGELOG.md"}

# Order matters: longer and more specific forms first.
RULES = [
    ("Workshop: Markdown and PDF", "Lumière: Markdown Editor and PDF Reader"),
    ("t04dj14n9.vscode-workshop", "t04dj14n9.lumiere"),
    ("vscode-workshop-<version>.vsix", "lumiere-<version>.vsix"),
    ("vscode-workshop-0.1.0.vsix", "lumiere-0.1.0.vsix"),
    ("vscode-workshop-${", "lumiere-${"),
    ("vscode-workshop@", "lumiere@"),
    # Regex-escaped prefixes in tests.
    ("markdownWorkshop\\.", "lumiere\\.markdown\\."),
    ("pdfWorkshop\\.", "lumiere\\.pdf\\."),
    # Setting, command, context, view and editor identifiers.
    ("markdownWorkshop.", "lumiere.markdown."),
    ("pdfWorkshop.", "lumiere.pdf."),
    # Configuration sections without the dot.
    ('getConfiguration("markdownWorkshop"', 'getConfiguration("lumiere.markdown"'),
    ('getConfiguration("pdfWorkshop"', 'getConfiguration("lumiere.pdf"'),
    ('section === "markdownWorkshop"', 'section === "lumiere.markdown"'),
    ('section === "pdfWorkshop"', 'section === "lumiere.pdf"'),
    ('`getConfiguration("markdownWorkshop")`', '`getConfiguration("lumiere.markdown")`'),
    ("getConfiguration('pdfWorkshop')", "getConfiguration('lumiere.pdf')"),
    ("getConfiguration(\n    \"markdownWorkshop\",", "getConfiguration(\n    \"lumiere.markdown\","),
    ("getConfiguration(\n      \"markdownWorkshop\",", "getConfiguration(\n      \"lumiere.markdown\","),
    ("under `markdownWorkshop`", "under `lumiere.markdown`"),
    ("`markdownWorkshop` all default", "`lumiere.markdown` all default"),
    ("contributed markdownWorkshop setting", "contributed lumiere.markdown setting"),
    ("(package `vscode-workshop`", "(package `lumiere`"),
    # Names people read.
    ("Markdown Workshop", "Lumière"),
    ("PDF Workshop", "Lumière PDF"),
    ('createOutputChannel("Workshop"', 'createOutputChannel("Lumière"'),
]


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout.decode()
    return [p for p in out.split("\0") if p]


def excluded(path: str) -> bool:
    return (
        path in EXCLUDE_EXACT
        or path.startswith(EXCLUDE_PREFIX)
        or pathlib.PurePosixPath(path).name in EXCLUDE_NAME
    )


def rewrite_text(text: str) -> str:
    for old, new in RULES:
        text = text.replace(old, new)
    return text


def rewrite_package_json(path: pathlib.Path) -> None:
    data = json.loads(path.read_text())
    data["name"] = "lumiere"
    data["displayName"] = "Lumière: Markdown Editor and PDF Reader"
    data["description"] = (
        "Obsidian-style Live Preview for Markdown and a PDF reader, in VS Code "
        "and Cursor, with links your AI agent can follow."
    )
    data["keywords"] = [
        "markdown",
        "pdf",
        "obsidian",
        "live preview",
        "notes",
        "wikilinks",
        "markdown editor",
        "pdf viewer",
        "pdf reader",
        "vscode",
        "cursor",
        "ai",
        "agent",
    ]
    data["repository"] = {
        "type": "git",
        "url": "https://github.com/t04dJ14n9/lumiere",
    }
    for key in ("bugs", "homepage"):
        if key in data and isinstance(data[key], str):
            data[key] = data[key].replace(
                "vscode-markdown-workbench", "lumiere"
            ).replace("vscode-markdown-workshop", "lumiere")
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    changed = 0
    for rel in tracked_files():
        if excluded(rel):
            continue
        path = ROOT / rel
        try:
            text = path.read_text()
        except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
            continue
        new = rewrite_text(text)
        if new != text:
            path.write_text(new)
            changed += 1
    rewrite_package_json(ROOT / "package.json")
    print(f"rewrote {changed} files")


main()
