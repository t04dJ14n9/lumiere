const NAMES: Readonly<Record<string, string>> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  md: "Markdown",
  markdown: "Markdown",
  php: "PHP",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

/**
 * The label a fenced block shows in its corner, as in Obsidian: a known
 * language's name, otherwise the fence's own word; none without a language.
 */
export function languageLabel(className: string): string | undefined {
  const language = /(?:^|\s)language-(\S+)/.exec(className)?.[1];
  if (!language) {
    return undefined;
  }
  return NAMES[language.toLowerCase()] ?? language;
}
