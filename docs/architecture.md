# Architecture

## JavaScript runtime

`@specter-bridge/core` owns the request IDs, promise callbacks, timeout handling, protocol checks, and error objects. The Android WebView injects `window.specterBridge`; the runtime sends JSON strings with `postMessage` and receives a response through the injected object's `message` event.

Plugins expose a small named API over `nativeCall(plugin, method, args)`. A JavaScript plugin does not grant native access by itself. The Android app must separately register a native implementation, and that implementation must explicitly handle each supported method.

## Android host

The template registers `WebViewCompat.addWebMessageListener` before loading the app. The listener allows only `https://appassets.androidplatform.net`, rejects subframe calls, checks the exact source origin, validates the message envelope, then dispatches to a registered plugin. Responses are posted back through the `JavaScriptReplyProxy` associated with the request.

Static app content is served from APK assets using `WebViewAssetLoader`. The template does not enable `file://` access. Keep remote or user-controlled pages out of the native WebView unless a separately reviewed navigation and origin policy is added.

JavaScript running in the trusted app page can call native plugins. The starter sets a Content Security Policy that blocks remote scripts; keep it in place and only add script origins you trust. The Android main-frame and origin checks also reject bridge calls from subframes and other origins.

## Storage plugin

The first native plugin stores JSON values in app-private `SharedPreferences`. It supports `get`, `set`, `remove`, and `clear`. It is not an encrypted secret store; applications should not put credentials or encryption keys in it.

## Current boundaries

- Android only; no iOS host exists yet.
- Calls are request/response only; events, permission mediation, activity results, and lifecycle hooks are future work.
- Requests are limited to 256 KiB of JSON text; binary and large payload transport is not implemented.
- Storage is app-private but not encrypted.
- The JavaScript package registry names are provisional until the first npm release.
