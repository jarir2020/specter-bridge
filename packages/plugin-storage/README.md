# @specter-bridge/plugin-storage

JSON value storage for Specter Bridge Android apps.

```js
import { Storage } from '@specter-bridge/plugin-storage';

await Storage.set('profile', { name: 'Example User' });
const profile = await Storage.get('profile');
await Storage.remove('profile');
```

The Android implementation uses app-private `SharedPreferences`. In a regular browser, the package uses `localStorage` so the same UI can be developed outside the native app. This is not encrypted storage; do not store credentials or cryptographic keys in it.
