# @specter-bridge/core

Promise-based JavaScript runtime for Specter Bridge native calls.

```js
import { nativeCall, registerPlugin, isNativePlatform } from '@specter-bridge/core';

const Device = registerPlugin('Device', ['getInfo']);
const info = await Device.getInfo();
```

The Android host must register a native plugin with the same name and method. Calls reject with `SpecterBridgeError` when the host is unavailable, the native method fails, or the request times out. The runtime uses the `specter/1` JSON protocol.
