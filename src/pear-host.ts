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
    __PEAR_INITIAL_CONFIG__?: Record<string, unknown>;
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

// Synchronous config store
const configStore: Record<string, unknown> =
  (typeof window !== 'undefined' && window.__PEAR_INITIAL_CONFIG__) || {
    options: {
      hideMenu: false,
      language: 'en',
      startingPage: '',
      likeButtons: 'show',
      removeUpgradeButton: false,
      alwaysOnTop: false,
      restartOnConfigChanges: false,
      resumeOnStart: true,
    },
    plugins: {
      'in-app-menu': { enabled: true },
      notifications: { enabled: true },
    },
  };

function getNested(obj: Record<string, unknown>, path?: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNested(obj: Record<string, unknown>, path: string, val: unknown) {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== 'object' || current[part] == null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = val;
}

interface MenuItemDef {
  commandId: number;
  label: string;
  type: 'normal' | 'submenu' | 'checkbox' | 'radio' | 'separator';
  visible?: boolean;
  checked?: boolean;
  sublabel?: string;
  toolTip?: string;
  pluginId?: string;
  submenu?: {
    items: MenuItemDef[];
  };
}

function getMenuDefinition(): { items: MenuItemDef[] } {
  const plugins = (configStore.plugins as Record<string, { enabled?: boolean }>) || {};
  const isEnabled = (id: string) => Boolean(plugins[id]?.enabled);

  return {
    items: [
      {
        commandId: 1000,
        label: 'File',
        type: 'submenu',
        visible: true,
        submenu: {
          items: [
            { commandId: 1, label: 'Restart', type: 'normal', visible: true },
            { commandId: 2, label: 'Quit', type: 'normal', visible: true },
          ],
        },
      },
      {
        commandId: 2000,
        label: 'Options',
        type: 'submenu',
        visible: true,
        submenu: {
          items: [
            {
              commandId: 10,
              label: 'Always on Top',
              type: 'checkbox',
              checked: Boolean(getNested(configStore, 'options.alwaysOnTop')),
              visible: true,
            },
            {
              commandId: 11,
              label: 'Resume on Start',
              type: 'checkbox',
              checked: Boolean(getNested(configStore, 'options.resumeOnStart') ?? true),
              visible: true,
            },
            {
              commandId: 12,
              label: 'Auto Reset App Cache',
              type: 'checkbox',
              checked: Boolean(getNested(configStore, 'options.autoResetAppCache')),
              visible: true,
            },
          ],
        },
      },
      {
        commandId: 3000,
        label: 'View',
        type: 'submenu',
        visible: true,
        submenu: {
          items: [
            { commandId: 20, label: 'Reload', type: 'normal', visible: true },
            { commandId: 21, label: 'Force Reload', type: 'normal', visible: true },
            { commandId: 22, label: 'Toggle Fullscreen', type: 'normal', visible: true },
          ],
        },
      },
      {
        commandId: 4000,
        label: 'Navigation',
        type: 'submenu',
        visible: true,
        submenu: {
          items: [
            { commandId: 30, label: 'Back', type: 'normal', visible: true },
            { commandId: 31, label: 'Forward', type: 'normal', visible: true },
          ],
        },
      },
      {
        commandId: 5000,
        label: 'Plugins',
        type: 'submenu',
        visible: true,
        submenu: {
          items: [
            { commandId: 101, label: 'In-App Menu', type: 'checkbox', checked: isEnabled('in-app-menu'), visible: true, pluginId: 'in-app-menu' },
            { commandId: 102, label: 'Visualizer', type: 'checkbox', checked: isEnabled('visualizer'), visible: true, pluginId: 'visualizer' },
            { commandId: 103, label: 'Synced Lyrics', type: 'checkbox', checked: isEnabled('synced-lyrics'), visible: true, pluginId: 'synced-lyrics' },
            { commandId: 104, label: 'Equalizer', type: 'checkbox', checked: isEnabled('equalizer'), visible: true, pluginId: 'equalizer' },
            { commandId: 105, label: 'SponsorBlock', type: 'checkbox', checked: isEnabled('sponsorblock'), visible: true, pluginId: 'sponsorblock' },
            { commandId: 106, label: 'Skip Silences', type: 'checkbox', checked: isEnabled('skip-silences'), visible: true, pluginId: 'skip-silences' },
            { commandId: 107, label: 'Precise Volume', type: 'checkbox', checked: isEnabled('precise-volume'), visible: true, pluginId: 'precise-volume' },
            { commandId: 108, label: 'Notifications', type: 'checkbox', checked: isEnabled('notifications'), visible: true, pluginId: 'notifications' },
            { commandId: 109, label: 'Discord Rich Presence', type: 'checkbox', checked: isEnabled('discord'), visible: true, pluginId: 'discord' },
            { commandId: 110, label: 'Downloader', type: 'checkbox', checked: isEnabled('downloader'), visible: true, pluginId: 'downloader' },
            { commandId: 111, label: 'Ambient Mode', type: 'checkbox', checked: isEnabled('ambient-mode'), visible: true, pluginId: 'ambient-mode' },
            { commandId: 112, label: 'Picture in Picture', type: 'checkbox', checked: isEnabled('picture-in-picture'), visible: true, pluginId: 'picture-in-picture' },
            { commandId: 113, label: 'Playback Speed', type: 'checkbox', checked: isEnabled('playback-speed'), visible: true, pluginId: 'playback-speed' },
            { commandId: 114, label: 'Quality Changer', type: 'checkbox', checked: isEnabled('quality-changer'), visible: true, pluginId: 'quality-changer' },
            { commandId: 115, label: 'Scrobbler', type: 'checkbox', checked: isEnabled('scrobbler'), visible: true, pluginId: 'scrobbler' },
            { commandId: 116, label: 'Album Actions', type: 'checkbox', checked: isEnabled('album-actions'), visible: true, pluginId: 'album-actions' },
            { commandId: 117, label: 'Album Color Theme', type: 'checkbox', checked: isEnabled('album-color-theme'), visible: true, pluginId: 'album-color-theme' },
            { commandId: 118, label: 'Blur Navigation Bar', type: 'checkbox', checked: isEnabled('blur-nav-bar'), visible: true, pluginId: 'blur-nav-bar' },
            { commandId: 119, label: 'Custom Output Device', type: 'checkbox', checked: isEnabled('custom-output-device'), visible: true, pluginId: 'custom-output-device' },
            { commandId: 120, label: 'Disable Autoplay', type: 'checkbox', checked: isEnabled('disable-autoplay'), visible: true, pluginId: 'disable-autoplay' },
          ],
        },
      },
    ],
  };
}

function findMenuItemById(commandId: number): MenuItemDef | null {
  const menu = getMenuDefinition();
  const stack = [...menu.items];
  while (stack.length > 0) {
    const item = stack.shift();
    if (!item) continue;
    if (item.commandId === commandId) return item;
    if (item.submenu?.items) {
      stack.push(...item.submenu.items);
    }
  }
  return null;
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
        return (getNested(configStore, key) as T) ?? (await invokeHost<T>('get_config', { key }));
      },
      async set(key: string, value: unknown) {
        setNested(configStore, key, value);
        await invokeHost('set_config', { key, value });
      },
      async patch(key: string, object: object) {
        const existing = (getNested(configStore, key) as Record<string, unknown>) ?? {};
        const merged = { ...existing, ...object };
        setNested(configStore, key, merged);
        await invokeHost('set_config', { key, value: merged });
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

    // Synchronous mainConfig mirror
    window.mainConfig = {
      get: (key?: string) => {
        return getNested(configStore, key);
      },
      set: (key: string, value: unknown) => {
        setNested(configStore, key, value);
        invokeHost('set_config', { key, value });
      },
      setPartial: (key: string, value: object) => {
        const existing = (getNested(configStore, key) as object) || {};
        const merged = { ...existing, ...value };
        setNested(configStore, key, merged);
        invokeHost('set_config', { key, value: merged });
      },
      setMenuOption: (key: string, value: unknown) => {
        setNested(configStore, key, value);
        invokeHost('set_config', { key, value });
      },
      edit: () => {},
      watch: (cb: (payload: unknown) => void) => {
        return pear.events.on('config-changed', cb);
      },
      plugins: {
        getPlugins: () => {
          return (configStore.plugins as Record<string, unknown>) || {};
        },
        isEnabled: async (plugin: string) => {
          const plugins = (configStore.plugins as Record<string, { enabled?: boolean }>) || {};
          return Boolean(plugins[plugin]?.enabled);
        },
        setOptions: (plugin: string, options: Record<string, unknown>) => {
          const plugins = (configStore.plugins as Record<string, Record<string, unknown>>) || {};
          const current = plugins[plugin] || {};
          const updated = { ...current, ...options };
          setNested(configStore, `plugins.${plugin}`, updated);
          invokeHost('set_config', { key: `plugins.${plugin}`, value: updated });
        },
        getOptions: (plugin: string) => {
          const plugins = (configStore.plugins as Record<string, unknown>) || {};
          return plugins[plugin];
        },
        enable: (plugin: string) => {
          setNested(configStore, `plugins.${plugin}.enabled`, true);
          invokeHost('set_config', { key: `plugins.${plugin}.enabled`, value: true });
        },
        disable: (plugin: string) => {
          setNested(configStore, `plugins.${plugin}.enabled`, false);
          invokeHost('set_config', { key: `plugins.${plugin}.enabled`, value: false });
        },
      },
    };

    // Temporary ipcRenderer compatibility shim
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
        if (channel === 'get-menu') {
          return getMenuDefinition();
        }
        if (channel === 'get-menu-by-id') {
          return findMenuItemById(args[0] as number);
        }
        if (channel === 'peard:menu-event') {
          const commandId = args[0] as number;
          if (commandId === 1) {
            await invokeHost('plugin:process|relaunch');
          } else if (commandId === 2) {
            await invokeHost('plugin:process|exit', { code: 0 });
          } else if (commandId === 20 || commandId === 21) {
            window.location.reload();
          } else if (commandId === 22) {
            if (document.fullscreenElement) {
              await document.exitFullscreen();
            } else {
              await document.documentElement.requestFullscreen();
            }
          } else if (commandId === 30) {
            window.history.back();
          } else if (commandId === 31) {
            window.history.forward();
          } else if (commandId === 10) {
            const current = Boolean(getNested(configStore, 'options.alwaysOnTop'));
            setNested(configStore, 'options.alwaysOnTop', !current);
            await invokeHost('window_set_always_on_top', { alwaysOnTop: !current });
          } else if (commandId >= 101 && commandId <= 120) {
            const item = findMenuItemById(commandId);
            if (item?.pluginId) {
              const current = Boolean(getNested(configStore, `plugins.${item.pluginId}.enabled`));
              setNested(configStore, `plugins.${item.pluginId}.enabled`, !current);
              await invokeHost('set_config', { key: `plugins.${item.pluginId}.enabled`, value: !current });
              emitLocal('config-changed', { key: `plugins.${item.pluginId}.enabled`, value: !current });
            }
          }
          return;
        }
        if (channel === 'window-is-maximized') {
          return invokeHost<boolean>('window_is_maximized');
        }
        if (channel === 'window-maximize') {
          return invokeHost('window_maximize');
        }
        if (channel === 'window-unmaximize') {
          return invokeHost('window_unmaximize');
        }
        if (channel === 'window-minimize') {
          return invokeHost('window_minimize');
        }
        if (channel === 'window-close') {
          return invokeHost('window_close');
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
