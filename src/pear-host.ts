/**
 * Pear Desktop Host API Bridge (Tauri 2 Implementation)
 * Provides compatibility layer for Pear plugins and renderer scripts.
 */

// Polyfill Promise.withResolvers for WebView2 environments that lack ES2024
if (typeof Promise !== 'undefined' && typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Only run in the top-level main frame (prevent subframes/iframes from running PearHost)
if (typeof window !== 'undefined') {
  try {
    if (window.self !== window.top) {
      throw new Error('[PearHost] Subframe ignored');
    }
  } catch {
    // Cross-origin iframe or subframe - abort
  }
}

// Prevent error storms from flooding DevTools console and causing memory leaks
if (typeof window !== 'undefined') {
  const errorCounts = new Map<string, number>();
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const key = String(args[0]);
    const count = (errorCounts.get(key) || 0) + 1;
    errorCounts.set(key, count);
    if (count <= 5) {
      origError(...args);
    } else if (count === 6) {
      console.warn(`[PearHost] Rate limiting error logging for: ${key.slice(0, 100)} (repeated > 5 times)`);
    }
  };
}

console.log('[PearHost] Initializing PearHost bridge in WebView2...');

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
  try {
    if (typeof window !== 'undefined' && window.__TAURI__?.core?.invoke) {
      return (await window.__TAURI__.core.invoke(cmd, args)) as T;
    }
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
      return (await window.__TAURI_INTERNALS__.invoke(cmd, args)) as T;
    }
  } catch (err) {
    // Non-fatal fallback for unpermitted or missing host commands
    return undefined as unknown as T;
  }
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
      'navigation': { enabled: false },
      'notifications': { enabled: true },
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

const menuActionMap = new Map<number, () => void | Promise<void>>();
let nextCommandId = 10000;

function registerMenuAction(action: () => void | Promise<void>): number {
  const id = ++nextCommandId;
  menuActionMap.set(id, action);
  return id;
}

function togglePlugin(pluginId: string) {
  const current = Boolean(getNested(configStore, `plugins.${pluginId}.enabled`));
  const next = !current;
  setNested(configStore, `plugins.${pluginId}.enabled`, next);
  invokeHost('set_config', { key: `plugins.${pluginId}.enabled`, value: next });
  emitLocal('config-changed', { key: `plugins.${pluginId}.enabled`, value: next });
  emitLocal('refresh-in-app-menu');
}

function setPluginConfigVal(pluginId: string, path: string, value: unknown) {
  const key = `plugins.${pluginId}.${path}`;
  setNested(configStore, key, value);
  invokeHost('set_config', { key, value });
  emitLocal('config-changed', { key, value });
  emitLocal('refresh-in-app-menu');
}

function getMenuDefinition(): { items: MenuItemDef[] } {
  menuActionMap.clear();

  const isPluginEnabled = (id: string) =>
    Boolean(getNested(configStore, `plugins.${id}.enabled`));
  const getVal = (id: string, path: string, fallback?: unknown) =>
    getNested(configStore, `plugins.${id}.${path}`) ?? fallback;

  function makePluginMenu(
    pluginId: string,
    label: string,
    extraSubmenuItems?: () => MenuItemDef[],
  ): MenuItemDef {
    const enabled = isPluginEnabled(pluginId);
    const toggleCmdId = registerMenuAction(() => togglePlugin(pluginId));

    if (!enabled || !extraSubmenuItems) {
      return {
        commandId: toggleCmdId,
        label,
        type: 'checkbox',
        checked: enabled,
        visible: true,
        pluginId,
      };
    }

    return {
      commandId: registerMenuAction(() => {}),
      label,
      type: 'submenu',
      visible: true,
      pluginId,
      submenu: {
        items: [
          {
            commandId: toggleCmdId,
            label: 'Enabled',
            type: 'checkbox',
            checked: true,
            visible: true,
            pluginId,
          },
          {
            commandId: ++nextCommandId,
            label: '',
            type: 'separator',
            visible: true,
          },
          ...extraSubmenuItems(),
        ],
      },
    };
  }

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
            makePluginMenu('in-app-menu', 'In-App Menu', () => [
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('in-app-menu', 'hideDOMWindowControls', false));
                  setPluginConfigVal('in-app-menu', 'hideDOMWindowControls', !cur);
                }),
                label: 'Hide DOM Window Controls',
                type: 'checkbox',
                checked: Boolean(getVal('in-app-menu', 'hideDOMWindowControls', false)),
                visible: true,
              },
            ]),
            makePluginMenu('visualizer', 'Visualizer', () => [
              {
                commandId: ++nextCommandId,
                label: 'Visualizer Type',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: (['butterchurn', 'vudio', 'wave'] as const).map((type) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('visualizer', 'type', type),
                    ),
                    label: type.charAt(0).toUpperCase() + type.slice(1),
                    type: 'radio',
                    checked: getVal('visualizer', 'type', 'butterchurn') === type,
                    visible: true,
                  })),
                },
              },
              {
                commandId: ++nextCommandId,
                label: 'Frames Per Second',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: [30, 60, 120, 144].map((fps) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('visualizer', 'fps', fps),
                    ),
                    label: `${fps} FPS`,
                    type: 'radio',
                    checked: getVal('visualizer', 'fps', 60) === fps,
                    visible: true,
                  })),
                },
              },
            ]),
            makePluginMenu('synced-lyrics', 'Synced Lyrics', () => [
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('synced-lyrics', 'preciseTiming', true));
                  setPluginConfigVal('synced-lyrics', 'preciseTiming', !cur);
                }),
                label: 'Precise Timing',
                type: 'checkbox',
                checked: Boolean(getVal('synced-lyrics', 'preciseTiming', true)),
                visible: true,
              },
              {
                commandId: ++nextCommandId,
                label: 'Line Effect',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: (['fancy', 'scale', 'offset'] as const).map((effect) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('synced-lyrics', 'lineEffect', effect),
                    ),
                    label: effect.charAt(0).toUpperCase() + effect.slice(1),
                    type: 'radio',
                    checked: getVal('synced-lyrics', 'lineEffect', 'fancy') === effect,
                    visible: true,
                  })),
                },
              },
            ]),
            makePluginMenu('equalizer', 'Equalizer', () => [
              {
                commandId: ++nextCommandId,
                label: 'Preset',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: ['Flat', 'Bass Boost', 'Vocal', 'Electronic', 'Rock'].map((preset) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('equalizer', 'preset', preset),
                    ),
                    label: preset,
                    type: 'radio',
                    checked: getVal('equalizer', 'preset', 'Flat') === preset,
                    visible: true,
                  })),
                },
              },
            ]),
            makePluginMenu('sponsorblock', 'SponsorBlock', () => [
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('sponsorblock', 'skipMusicOffTopic', true));
                  setPluginConfigVal('sponsorblock', 'skipMusicOffTopic', !cur);
                }),
                label: 'Skip Music Off-Topic',
                type: 'checkbox',
                checked: Boolean(getVal('sponsorblock', 'skipMusicOffTopic', true)),
                visible: true,
              },
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('sponsorblock', 'skipNonMusic', true));
                  setPluginConfigVal('sponsorblock', 'skipNonMusic', !cur);
                }),
                label: 'Skip Non-Music Sections',
                type: 'checkbox',
                checked: Boolean(getVal('sponsorblock', 'skipNonMusic', true)),
                visible: true,
              },
            ]),
            makePluginMenu('skip-silences', 'Skip Silences'),
            makePluginMenu('precise-volume', 'Precise Volume', () => [
              {
                commandId: ++nextCommandId,
                label: 'Volume Step',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: [1, 2, 5, 10].map((step) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('precise-volume', 'steps', step),
                    ),
                    label: `${step}%`,
                    type: 'radio',
                    checked: getVal('precise-volume', 'steps', 5) === step,
                    visible: true,
                  })),
                },
              },
            ]),
            makePluginMenu('notifications', 'Notifications', () => [
              {
                commandId: ++nextCommandId,
                label: 'Urgency',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: (['low', 'normal', 'critical'] as const).map((level) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('notifications', 'urgency', level),
                    ),
                    label: level.charAt(0).toUpperCase() + level.slice(1),
                    type: 'radio',
                    checked: getVal('notifications', 'urgency', 'normal') === level,
                    visible: true,
                  })),
                },
              },
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('notifications', 'interactive', true));
                  setPluginConfigVal('notifications', 'interactive', !cur);
                }),
                label: 'Interactive Notification',
                type: 'checkbox',
                checked: Boolean(getVal('notifications', 'interactive', true)),
                visible: true,
              },
            ]),
            makePluginMenu('discord', 'Discord Rich Presence', () => [
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('discord', 'showTimeRemaining', true));
                  setPluginConfigVal('discord', 'showTimeRemaining', !cur);
                }),
                label: 'Show Time Remaining',
                type: 'checkbox',
                checked: Boolean(getVal('discord', 'showTimeRemaining', true)),
                visible: true,
              },
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('discord', 'showSongDetails', true));
                  setPluginConfigVal('discord', 'showSongDetails', !cur);
                }),
                label: 'Show Song Details',
                type: 'checkbox',
                checked: Boolean(getVal('discord', 'showSongDetails', true)),
                visible: true,
              },
            ]),
            makePluginMenu('downloader', 'Downloader', () => [
              {
                commandId: ++nextCommandId,
                label: 'Audio Format',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: (['mp3', 'flac', 'm4a', 'opus'] as const).map((fmt) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('downloader', 'preset', fmt),
                    ),
                    label: fmt.toUpperCase(),
                    type: 'radio',
                    checked: getVal('downloader', 'preset', 'mp3') === fmt,
                    visible: true,
                  })),
                },
              },
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('downloader', 'skipExisting', true));
                  setPluginConfigVal('downloader', 'skipExisting', !cur);
                }),
                label: 'Skip Existing Files',
                type: 'checkbox',
                checked: Boolean(getVal('downloader', 'skipExisting', true)),
                visible: true,
              },
            ]),
            makePluginMenu('ambient-mode', 'Ambient Mode', () => [
              {
                commandId: ++nextCommandId,
                label: 'Quality',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: [
                    { label: 'Low', value: 'low' },
                    { label: 'Medium', value: 'medium' },
                    { label: 'High', value: 'high' },
                  ].map((q) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('ambient-mode', 'quality', q.value),
                    ),
                    label: q.label,
                    type: 'radio',
                    checked: getVal('ambient-mode', 'quality', 'medium') === q.value,
                    visible: true,
                  })),
                },
              },
              {
                commandId: ++nextCommandId,
                label: 'Opacity',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: [
                    { label: '50%', value: 0.5 },
                    { label: '85%', value: 0.85 },
                    { label: '100%', value: 1.0 },
                  ].map((o) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('ambient-mode', 'opacity', o.value),
                    ),
                    label: o.label,
                    type: 'radio',
                    checked: getVal('ambient-mode', 'opacity', 0.85) === o.value,
                    visible: true,
                  })),
                },
              },
            ]),
            makePluginMenu('picture-in-picture', 'Picture in Picture', () => [
              {
                commandId: registerMenuAction(() => {
                  const cur = Boolean(getVal('picture-in-picture', 'alwaysOnTop', true));
                  setPluginConfigVal('picture-in-picture', 'alwaysOnTop', !cur);
                }),
                label: 'Always on Top',
                type: 'checkbox',
                checked: Boolean(getVal('picture-in-picture', 'alwaysOnTop', true)),
                visible: true,
              },
            ]),
            makePluginMenu('playback-speed', 'Playback Speed', () => [
              {
                commandId: ++nextCommandId,
                label: 'Speed',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('playback-speed', 'speed', spd),
                    ),
                    label: `${spd}x`,
                    type: 'radio',
                    checked: getVal('playback-speed', 'speed', 1.0) === spd,
                    visible: true,
                  })),
                },
              },
            ]),
            makePluginMenu('quality-changer', 'Quality Changer', () => [
              {
                commandId: ++nextCommandId,
                label: 'Preferred Quality',
                type: 'submenu',
                visible: true,
                submenu: {
                  items: [
                    { label: 'High (256kbps)', value: 'high' },
                    { label: 'Normal (128kbps)', value: 'normal' },
                    { label: 'Low (64kbps)', value: 'low' },
                  ].map((q) => ({
                    commandId: registerMenuAction(() =>
                      setPluginConfigVal('quality-changer', 'quality', q.value),
                    ),
                    label: q.label,
                    type: 'radio',
                    checked: getVal('quality-changer', 'quality', 'high') === q.value,
                    visible: true,
                  })),
                },
              },
            ]),
            makePluginMenu('scrobbler', 'Scrobbler'),
            makePluginMenu('album-actions', 'Album Actions'),
            makePluginMenu('album-color-theme', 'Album Color Theme'),
            makePluginMenu('blur-nav-bar', 'Blur Navigation Bar'),
            makePluginMenu('custom-output-device', 'Custom Output Device'),
            makePluginMenu('disable-autoplay', 'Disable Autoplay'),
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
  if (typeof window !== 'undefined') {
    try {
      if (window.self !== window.top) {
        return (window as any).pear || {};
      }
    } catch {
      return (window as any).pear || {};
    }
    if ((window as any).__PEAR_HOST_INITIALIZED__) {
      return (window as any).pear || {};
    }
    (window as any).__PEAR_HOST_INITIALIZED__ = true;
  }

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
        if (!key) return configStore as T;
        const val = getNested(configStore, key) as T;
        if (val !== undefined) return val;
        try {
          const remote = await invokeHost<T>('get_config', { key });
          if (remote !== undefined) return remote;
        } catch {}
        return undefined as unknown as T;
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
      send: (_channel: string, ..._args: unknown[]) => {
        // In Electron, ipcRenderer.send is one-way from renderer to main.
        // We purposefully do NOT echo locally to ipcRenderer.on to prevent infinite feedback loops.
      },
      removeListener: () => {},
      removeAllListeners: () => {},
      invoke: async (channel: string, ...args: unknown[]) => {
        try {
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
            const action = menuActionMap.get(commandId);
            if (action) {
              await action();
              return;
            }
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
              emitLocal('refresh-in-app-menu');
            } else if (commandId === 11) {
              const current = Boolean(getNested(configStore, 'options.resumeOnStart') ?? true);
              setNested(configStore, 'options.resumeOnStart', !current);
              await invokeHost('set_config', { key: 'options.resumeOnStart', value: !current });
              emitLocal('refresh-in-app-menu');
            } else if (commandId === 12) {
              const current = Boolean(getNested(configStore, 'options.autoResetAppCache') ?? false);
              setNested(configStore, 'options.autoResetAppCache', !current);
              await invokeHost('set_config', { key: 'options.autoResetAppCache', value: !current });
              emitLocal('refresh-in-app-menu');
            }
            return;
          }
          if (channel === 'window-is-maximized') {
            try {
              const res = await invokeHost<boolean>('window_is_maximized');
              return typeof res === 'boolean' ? res : false;
            } catch {
              return false;
            }
          }
          if (channel === 'window-maximize') {
            return invokeHost('window_maximize').catch(() => {});
          }
          if (channel === 'window-unmaximize') {
            return invokeHost('window_unmaximize').catch(() => {});
          }
          if (channel === 'window-minimize') {
            return invokeHost('window_minimize').catch(() => {});
          }
          if (channel === 'window-close') {
            return invokeHost('window_close').catch(() => {});
          }
          return await invokeHost(channel, { args }).catch(() => null);
        } catch {
          return null;
        }
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

    window.dispatchEvent(new Event('pear:ready'));
  }

  return pear;
}

// Automatically initialize host bridge on module evaluation so window.ipcRenderer
// and window.mainConfig are available to hoisted ES module imports.
if (typeof window !== 'undefined') {
  initPearHost();
}
