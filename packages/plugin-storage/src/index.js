import { isNativePlatform, registerPlugin } from '@specter-bridge/core';

const nativeStorage = registerPlugin('Storage', ['get', 'set', 'remove', 'clear']);

function serialize(value) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Storage values must be JSON serializable.');
  return encoded;
}

function browserGet(key) {
  const value = globalThis.localStorage?.getItem(key);
  return value === null || value === undefined ? null : JSON.parse(value);
}

export const Storage = Object.freeze({
  async get(key) {
    if (typeof key !== 'string' || key.length === 0) throw new TypeError('key must be a non-empty string.');
    if (isNativePlatform()) return nativeStorage.get({ key });
    return browserGet(key);
  },
  async set(key, value) {
    if (typeof key !== 'string' || key.length === 0) throw new TypeError('key must be a non-empty string.');
    const serialized = serialize(value);
    if (isNativePlatform()) return nativeStorage.set({ key, value: JSON.parse(serialized) });
    if (!globalThis.localStorage) throw new Error('localStorage is not available in this environment.');
    globalThis.localStorage.setItem(key, serialized);
  },
  async remove(key) {
    if (typeof key !== 'string' || key.length === 0) throw new TypeError('key must be a non-empty string.');
    if (isNativePlatform()) return nativeStorage.remove({ key });
    globalThis.localStorage?.removeItem(key);
  },
  async clear() {
    if (isNativePlatform()) return nativeStorage.clear({});
    globalThis.localStorage?.clear();
  }
});

export default Storage;
