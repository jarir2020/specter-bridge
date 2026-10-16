# Repository guidance

## Project shape

- This is the Specter Bridge npm-workspaces monorepo. Packages use ES modules and require Node.js 20 or newer.
- `packages/core` owns the JavaScript request/response runtime; `packages/plugin-storage` exposes the Storage API; `packages/cli` generates apps and contains the Android template.
- Keep generated Android template changes aligned with the CLI, README, and `docs/` guides.

## Android security and behavior

- Preserve the exact `https://appassets.androidplatform.net` origin allowlist, main-frame restriction, request validation, and `WebViewAssetLoader` asset loading.
- Do not add `addJavascriptInterface`, broad file URL access, or remote navigation to the native WebView.
- A JavaScript plugin does not grant native access. Register each native implementation explicitly and validate its arguments and methods.
- Storage uses app-private `SharedPreferences`; it is not an encrypted secret store. Do not describe it as secure credential storage.

## Working changes

- Read the relevant architecture or CLI guide before changing its behavior.
- Keep edits scoped to the request and preserve unrelated working-tree changes.
- Do not claim iOS support, native permissions, lifecycle events, or plugins that are not implemented.
- Do not publish npm packages unless explicitly asked.

## Validation

- Check changed JavaScript with `node --check` and parse changed JSON manifests.
- Android builds require SDK Platform 35, Gradle 8.13 through 8.x, and a supported JDK (17 is the documented baseline).
- When available, test on an emulator/device and report build, install, and runtime results separately. This repository currently has no automated test script.
