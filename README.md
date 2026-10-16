# Specter Bridge

Specter Bridge is an Android-first native runtime and project tool for web apps. It is a separate project from Ghost.js; Ghost.js can be used to build the web UI, while Specter Bridge hosts the resulting static files in an Android WebView and exposes registered native plugins.

## Current scope

- JavaScript request/response runtime with timeout and pending-call cleanup.
- Android WebView runtime using an origin-restricted `WebMessageListener`.
- In-app assets served through `WebViewAssetLoader` at `https://appassets.androidplatform.net`.
- Native Storage plugin backed by `SharedPreferences`.
- CLI commands: `init`, `add android`, `sync android`, `build android`, and `run android`.

iOS, camera, location, notifications, and plugin lifecycle APIs are not implemented yet.

## Requirements

- Node.js 20 or newer.
- Android Studio or an Android SDK for APK builds and device runs.
- Android Gradle Plugin 8.13.2, Gradle 8.13, and JDK 17 for the generated template.

The generated Android project currently targets API 35 and supports API 24 and newer.

## Try the CLI from this checkout

```sh
cd specter-bridge
npm run specter -- init "My Specter App" --app-id com.example.myspecter
cd my-specter-app
npm run build
npx specter add android
npx specter sync android
npx specter build android
npx specter run android
```

`init` creates a Vite starter project and an app configuration. Its local dependencies point to this checkout's core, CLI, and Storage packages, so the initial example works before publishing the npm packages. `add android` copies the native template. `sync android` copies the configured web output into the Android assets directory.

## Use the JavaScript API

```js
import { Storage } from '@specter-bridge/plugin-storage';

await Storage.set('theme', { mode: 'dark' });
const theme = await Storage.get('theme');
```

Native calls are only available in the generated Android app. In a regular browser the Storage plugin uses `localStorage` as a development fallback.

## Protocol

Requests have the shape `{ protocol: "specter/1", id, plugin, method, args }`. Responses carry the same `id` and either `{ ok: true, value }` or `{ ok: false, error: { code, message } }`. Android accepts calls from the main frame at the exact local app origin only, and dispatches only methods exposed by a registered native plugin.

See [the architecture and development notes](docs/architecture.md) and [the CLI guide](docs/cli.md).

For a Ghost.js app, see [the Ghost.js integration guide](docs/ghostjs-integration.md).

## License

Specter Bridge is available under the [MIT License](LICENSE).
