
```mermaid
flowchart TD
      A[GitHub: Push v* tag] --> B[CI: Build Tauri app]
      B --> C[CI: Sign app with "Developer ID certificate"]
      C --> D[CI: Zip signed app]
      D --> E[CI: Upload to Apple Notary Service]
      E --> F{Apple: Automated scan}
      F -->|Pass| G[Apple: Issue notarization ticket]
      F -->|Fail| H[CI: Build fails with error details]
      G --> I[CI: Staple ticket to app]
      I --> J[CI: Package as DMG]
      J --> K[CI: Upload to GitHub Release]
      K --> L[User: Downloads DMG]
      L --> M[User: Opens app]
      M --> N{macOS Gatekeeper check}
      N -->|Ticket found| O[App opens normally]
      N -->|No ticket| P[Gatekeeper checks Apple servers]
      P -->|Notarized| O
      P -->|Not notarized| Q[Scary warning dialog]
```
