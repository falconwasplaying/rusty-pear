// Pear Desktop Host API implementation for Tauri 2

export interface PearApp {
  getPath(name: string): Promise<string>;
  relaunch(): Promise<void>;
  exit(code?: number): Promise<void>;
}

export interface PearWindow {
  getState(): Promise<unknown>;
  setSize(width: number, height: number): Promise<void>;
  setPosition(x: number, y: number): Promise<void>;
  maximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setAlwaysOnTop(value: boolean): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  close(): Promise<void>;
  setDecorations(options: unknown): Promise<void>;
}

export interface PearConfig {
  get<T = unknown>(key?: string): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
  patch(key: string, object: object): Promise<void>;
  watch(listener: (newValue: unknown, oldValue: unknown) => void): () => void;
}

export interface PearEvents {
  on(name: string, listener: (payload: unknown) => void): () => void;
  once(name: string, listener: (payload: unknown) => void): () => void;
  emit(name: string, payload?: unknown): Promise<void>;
}

export interface PearNative {
  openExternal(target: string): Promise<void>;
  showDialog(options: unknown): Promise<unknown>;
  selectFile(options?: unknown): Promise<string | null>;
  selectDirectory(options?: unknown): Promise<string | null>;
}

export interface PearShortcuts {
  register(definition: unknown): Promise<void>;
  unregister(id: string): Promise<void>;
}

export interface PearPlugins {
  list(): Promise<string[]>;
  getConfig(id: string): Promise<unknown>;
  setConfig(id: string, patch: object): Promise<void>;
}

export interface PearHost {
  app: PearApp;
  window: PearWindow;
  config: PearConfig;
  events: PearEvents;
  native: PearNative;
  shortcuts: PearShortcuts;
  plugins: PearPlugins;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    __TAURI__?: {
      core?: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      event?: {
        listen: (event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>;
        emit: (event: string, payload?: unknown) => Promise<void>;
      };
    };
    pear?: PearHost;
    ipcRenderer?: unknown;
    mainConfig?: unknown;
    electronIs?: unknown;
  }
}

// Low-level invocation helper
export async function invokeHost<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window !== 'undefined' && window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke(cmd, args) as Promise<T>;
  }
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args) as Promise<T>;
  }
  console.warn(`[PearHost] Tauri invoke not found in current environment for command "${cmd}"`);
  return undefined as unknown as T;
}

// Low-level event listeners
const eventListeners = new Map<string, Set<(payload: unknown) => void>>();

export function emitLocal(name: string, payload?: unknown) {
  const set = eventListeners.get(name);
  if (set) {
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[PearHost] Error in event listener for ${name}:`, err);
      }
    });
  }
}

export function initPearHost(): PearHost {
  const pear: PearHost = {
    app: {
      async getPath(_name: string) {
        return '';
      },
      async relaunch() {
        await invokeHost('plugin:process|relaunch');
      },
      async exit(code = 0) {
        await invokeHost('plugin:process|exit', { code });
      },
    },
    window: {
      async getState() {
        return invokeHost('get_config', { key: 'window-size' });
      },
      async setSize(width: number, height: number) {
        await invokeHost('window_set_size', { width, height });
      },
      async setPosition(x: number, y: number) {
        await invokeHost('window_set_position', { x, y });
      },
      async maximize() {
        await invokeHost('window_maximize');
      },
      async isMaximized() {
        return invokeHost<boolean>('window_is_maximized');
      },
      async setAlwaysOnTop(value: boolean) {
        await invokeHost('window_set_always_on_top', { alwaysOnTop: value });
      },
      async show() {
        await invokeHost('window_show');
      },
      async hide() {
        await invokeHost('window_hide');
      },
      async close() {
        await invokeHost('window_close');
      },
      async setDecorations(_options: unknown) {},
    },
    config: {
      async get<T = unknown>(key?: string): Promise<T> {
        return invokeHost<T>('get_config', { key });
      },
      async set(key: string, value: unknown) {
        await invokeHost('set_config', { key, value });
      },
      async patch(key: string, object: object) {
        const existing = (await pear.config.get<Record<string, unknown>>(key)) ?? {};
        const merged = { ...existing, ...object };
        await pear.config.set(key, merged);
      },
      watch(listener) {
        return pear.events.on('config-changed', (payload) => {
          listener(payload, undefined);
        });
      },
    },
    events: {
      on(name: string, listener: (payload: unknown) => void) {
        if (!eventListeners.has(name)) {
          eventListeners.set(name, new Set());
          if (typeof window !== 'undefined' && window.__TAURI__?.event?.listen) {
            window.__TAURI__.event.listen(name, (e) => {
              emitLocal(name, e.payload);
            });
          }
        }
        eventListeners.get(name)!.add(listener);
        return () => {
          eventListeners.get(name)?.delete(listener);
        };
      },
      once(name: string, listener: (payload: unknown) => void) {
        const unsub = pear.events.on(name, (payload) => {
          unsub();
          listener(payload);
        });
        return unsub;
      },
      async emit(name: string, payload?: unknown) {
        emitLocal(name, payload);
        if (typeof window !== 'undefined' && window.__TAURI__?.event?.emit) {
          await window.__TAURI__.event.emit(name, payload);
        }
      },
    },
    native: {
      async openExternal(target: string) {
        await invokeHost('plugin:opener|open_url', { url: target });
      },
      async showDialog(options: unknown) {
        return invokeHost('plugin:dialog|message', { options });
      },
      async selectFile(_options?: unknown) {
        return null;
      },
      async selectDirectory(_options?: unknown) {
        return null;
      },
    },
    shortcuts: {
      async register(_definition: unknown) {},
      async unregister(_id: string) {},
    },
    plugins: {
      async list() {
        return [];
      },
      async getConfig(id: string) {
        return pear.config.get(`plugins.${id}`);
      },
      async setConfig(id: string, patch: object) {
        await pear.config.patch(`plugins.${id}`, patch);
      },
    },
  };

  if (typeof window !== 'undefined') {
    window.pear = pear;

    // Temporary ipcRenderer compatibility shim for progressive migration (Section 6.2)
    window.ipcRenderer = {
      on: (channel: string, listener: (...args: unknown[]) => void) => {
        return pear.events.on(channel, (payload) => listener({} as unknown, payload));
      },
      off: () => {},
      once: (channel: string, listener: (...args: unknown[]) => void) => {
        return pear.events.once(channel, (payload) => listener({} as unknown, payload));
      },
      send: (channel: string, ...args: unknown[]) => {
        pear.events.emit(channel, args[0]);
      },
      removeListener: () => {},
      removeAllListeners: () => {},
      invoke: async (channel: string, ...args: unknown[]) => {
        if (channel === 'peard:get-config') {
          return pear.config.get(`plugins.${args[0]}`);
        }
        if (channel === 'peard:set-config') {
          return pear.config.set(`plugins.${args[0]}`, args[1]);
        }
        return invokeHost(channel, { args });
      },
      sendSync: () => null,
      sendToHost: () => {},
    };

    window.electronIs = {
      osx: () => navigator.userAgent.includes('Mac'),
      windows: () => navigator.userAgent.includes('Win'),
      linux: () => navigator.userAgent.includes('Linux'),
      dev: () => false,
    };
  }

  return pear;
}
