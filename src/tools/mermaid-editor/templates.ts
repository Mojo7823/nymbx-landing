export interface DiagramTemplate {
  id: string
  label: string
  code: string
}

export const templates: DiagramTemplate[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    code: `flowchart TD
  A[Start] --> B{Files selected?}
  B -- yes --> C[Process in browser]
  B -- no --> D[Show dropzone]
  C --> E[Download result]
  D --> B
`,
  },
  {
    id: 'sequence',
    label: 'Sequence',
    code: `sequenceDiagram
  participant U as User
  participant B as Browser
  participant W as Worker
  U->>B: Drop file
  B->>W: Process (off main thread)
  W-->>B: Result
  B-->>U: Download
`,
  },
  {
    id: 'gantt',
    label: 'Gantt',
    code: `gantt
  title Toolbox roadmap
  dateFormat YYYY-MM-DD
  section Markdown
    Em-dash remover   :done, a1, 2026-07-01, 3d
    Diff checker      :done, a2, after a1, 4d
    Mermaid editor    :active, a3, after a2, 4d
  section Images
    Image resize      :b1, after a3, 5d
`,
  },
  {
    id: 'class',
    label: 'Class',
    code: `classDiagram
  class ToolMeta {
    +string slug
    +string name
    +ToolBadge badge
  }
  class ToolLayout {
    +render()
  }
  ToolLayout <|-- ToolPage
  ToolPage o-- ToolMeta
`,
  },
  {
    id: 'state',
    label: 'State',
    code: `stateDiagram-v2
  [*] --> Idle
  Idle --> Processing : file dropped
  Processing --> Done : success
  Processing --> Error : failure
  Error --> Idle : retry
  Done --> [*]
`,
  },
  {
    id: 'pie',
    label: 'Pie',
    code: `pie showData
  title Tools by category
  "Markdown" : 6
  "Image" : 9
  "PDF & Office" : 9
  "Text & Dev" : 13
`,
  },
]
