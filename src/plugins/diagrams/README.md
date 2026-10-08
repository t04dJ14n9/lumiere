# Diagrams

Claims Mermaid fences through render/fence and a reveal-on-caret block renderer.
Mermaid loads lazily, uses strict security, disables HTML labels, and serializes
renders. SVG is sanitized before insertion. Disposal restores the original code
and cancels late results. Injects livePreview and render; no commands or keys.
