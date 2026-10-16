const PROTOCOL = 'specter/1';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_MESSAGE_CHARS = 262_144;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class SpecterBridgeError extends Error {
  constructor(message, code = 'BRIDGE_ERROR', details) {
    super(message);
    this.name = 'SpecterBridgeError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function parseResponse(raw) {
  let response;
  try {
    response = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new SpecterBridgeError('Native bridge returned invalid JSON.', 'INVALID_RESPONSE');
  }
  if (!response || response.protocol !== PROTOCOL || typeof response.id !== 'string') {
    throw new SpecterBridgeError('Native bridge returned an invalid response envelope.', 'INVALID_RESPONSE');
  }
  return response;
}

export function createBridge({ getTransport = () => globalThis.specterBridge, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive finite number.');
  }

  const pending = new Map();
  let nextId = 0;
  let attachedTransport = null;

  function receive(event) {
    let response;
    try {
      response = parseResponse(event?.data);
    } catch (error) {
      return;
    }

    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    clearTimeout(entry.timer);

    if (response.ok === true) {
      entry.resolve(response.value);
      return;
    }

    const nativeError = response.error && typeof response.error === 'object' ? response.error : {};
    entry.reject(new SpecterBridgeError(
      typeof nativeError.message === 'string' ? nativeError.message : 'Native call failed.',
      typeof nativeError.code === 'string' ? nativeError.code : 'NATIVE_ERROR',
      nativeError.details
    ));
  }

  function attach(transport) {
    if (attachedTransport === transport) return;
    if (attachedTransport?.removeEventListener) {
      attachedTransport.removeEventListener('message', receive);
    }
    if (typeof transport?.addEventListener !== 'function' || typeof transport?.postMessage !== 'function') {
      throw new SpecterBridgeError('Specter Bridge is not available in this environment.', 'BRIDGE_UNAVAILABLE');
    }
    transport.addEventListener('message', receive);
    attachedTransport = transport;
  }

  function nativeCall(plugin, method, args = {}) {
    if (typeof plugin !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(plugin)) {
      return Promise.reject(new TypeError('plugin must be a valid plugin name.'));
    }
    if (typeof method !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(method)) {
      return Promise.reject(new TypeError('method must be a valid method name.'));
    }
    if (args === null || typeof args !== 'object' || Array.isArray(args) || ![Object.prototype, null].includes(Object.getPrototypeOf(args))) {
      return Promise.reject(new TypeError('args must be a plain object.'));
    }

    let encodedArgs;
    try {
      encodedArgs = JSON.stringify(args);
      if (encodedArgs === undefined) throw new TypeError('args are not JSON serializable.');
    } catch (error) {
      return Promise.reject(new TypeError(`args must be JSON serializable: ${error.message}`));
    }

    const transport = getTransport();
    try {
      attach(transport);
    } catch (error) {
      return Promise.reject(error);
    }

    const id = `js-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
    if (!ID_PATTERN.test(id)) return Promise.reject(new SpecterBridgeError('Could not allocate a bridge request ID.', 'INVALID_REQUEST'));
    const message = JSON.stringify({
      protocol: PROTOCOL,
      id,
      plugin,
      method,
      args: JSON.parse(encodedArgs)
    });
    if (message.length > MAX_MESSAGE_CHARS) {
      return Promise.reject(new SpecterBridgeError(`Native request exceeds the ${MAX_MESSAGE_CHARS}-character payload limit.`, 'PAYLOAD_TOO_LARGE'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new SpecterBridgeError(`Native call ${plugin}.${method} timed out after ${timeoutMs} ms.`, 'TIMEOUT'));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      try {
        transport.postMessage(message);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new SpecterBridgeError(`Could not send native call: ${error.message}`, 'TRANSPORT_ERROR'));
      }
    });
  }

  return Object.freeze({
    nativeCall,
    isNative: () => {
      const transport = getTransport();
      return typeof transport?.postMessage === 'function' && typeof transport?.addEventListener === 'function';
    },
    pendingCount: () => pending.size
  });
}

const defaultBridge = createBridge();

export const nativeCall = defaultBridge.nativeCall;
export const isNativePlatform = defaultBridge.isNative;

export function registerPlugin(pluginName, methodNames) {
  if (typeof pluginName !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(pluginName)) {
    throw new TypeError('pluginName must be a valid plugin name.');
  }
  if (!Array.isArray(methodNames) || methodNames.length === 0) {
    throw new TypeError('methodNames must be a non-empty array.');
  }
  const methods = {};
  for (const method of methodNames) {
    if (typeof method !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(method)) {
      throw new TypeError(`Invalid plugin method name: ${String(method)}`);
    }
    methods[method] = (args = {}) => nativeCall(pluginName, method, args);
  }
  return Object.freeze(methods);
}
