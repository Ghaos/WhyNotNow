# WhyNotNow dialogue flowchart

This diagram shows the dashboard's three states and the two kinds of Codex sessions. For detailed conversation guidance, see [Dialogue design](dialogue-design.md).

```mermaid
flowchart TD
    Z["Invoke $wnn-init"] --> ZA["Start the local dashboard service"]
    ZA --> ZB["Open the dashboard in a browser"]
    ZB --> A
    A["Create task in dashboard"] --> B["Before"]
    C["Record task with $wnn"] --> D["Considering"]
    C --> Q["Do not execute original task;<br/>ask about one obstacle"]

    B --> E{"Next action"}
    E -->|"Why not now?"| F["Create a new Codex dialogue session"]
    F --> G["Set status to considering"]
    G --> H["Start a why-not-now turn"]
    H -->|"Success"| D
    H -->|"Failure"| R1["Return to before;<br/>discard unused session"]

    E -->|"Do it now"| I["Create a new Codex execution session"]
    D --> J{"Do it now"}
    J --> I
    I --> K["Set status to executed"]
    K --> L["Include saved context and start execution<br/>without another confirmation"]
    L -->|"Success"| M["Executed"]
    L -->|"Failure"| R2["Return to the previous state;<br/>discard unused session"]

    Q --> N["User explains circumstances"]
    N --> O["Store structured goals, reasons, obstacles,<br/>constraints, completion criteria, and more"]
    O --> P{"Natural next move"}
    P -->|"Deepen"| Q2["Ask about one immediate point"]
    Q2 --> N
    P -->|"Connect"| Q3["Connect to context, conditions, or expectations"]
    Q3 --> N
    P -->|"Focused research could help"| S["Present scope and expected result; obtain consent"]
    S -->|"Accepted"| T["Research read-only and<br/>store structured findings"]
    T --> P
    S -->|"Declined"| P
    P -->|"Sufficiently organized"| U["Summarize and, if needed, point to<br/>Do it now in the dashboard"]

    M -. "Do not store session IDs or links" .-> V["Codex task list"]
```

The `codex://` URL returned by the dashboard is used only as a temporary handoff when launching; it is not included in stored fields or list APIs.
