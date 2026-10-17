# Diagrams

```mermaid
flowchart LR
  Write --> Preview
  Preview --> Edit
  Edit --> Write
```

```mermaid
sequenceDiagram
  Editor->>Vault: index the note
  Vault-->>Editor: links resolved
```

An invalid diagram shows an error:

```mermaid
flowchart LR
  A -->
```
