// Electron compatibility shim for Pear Desktop on Tauri 2
// Exposes semantic host operations via window.pear and stubs legacy Electron APIs

export const ipcRenderer = new Proxy({} as Record<string, unknown>, {
  get(_target, prop: string) {
    if (typeof window !== 'undefined' && (window as any).ipcRenderer) {
      return (window as any).ipcRenderer[prop];
    }
    return () => {};
  },
});

export const shell = {
  openExternal: async (url: string) => {
    if (typeof window !== 'undefined' && window.pear?.native?.openExternal) {
      await window.pear.native.openExternal(url);
    }
  },
};

export const dialog = {
  showMessageBox: async (options: unknown) => {
    if (typeof window !== 'undefined' && window.pear?.native?.showDialog) {
      return window.pear.native.showDialog(options);
    }
    return { response: 0 };
  },
  showErrorBox: (title: string, content: string) => {
    console.error(`[Dialog Error] ${title}: ${content}`);
  },
};

export const net = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    return globalThis.fetch(input, init);
  },
};

export const app = {
  getPath: async (name: string) => {
    if (typeof window !== 'undefined' && window.pear?.app?.getPath) {
      return window.pear.app.getPath(name);
    }
    return '';
  },
  relaunch: () => {
    window.pear?.app?.relaunch();
  },
  exit: (code?: number) => {
    window.pear?.app?.exit(code);
  },
};

export const globalShortcut = {
  register: async (shortcut: string, callback: () => void) => {
    if (typeof window !== 'undefined' && window.pear?.shortcuts?.register) {
      await window.pear.shortcuts.register({ shortcut, callback });
    }
  },
  unregister: async (shortcut: string) => {
    if (typeof window !== 'undefined' && window.pear?.shortcuts?.unregister) {
      await window.pear.shortcuts.unregister(shortcut);
    }
  },
  unregisterAll: () => {},
  isRegistered: () => false,
};

export const nativeImage = {
  createEmpty: () => ({
    toPNG: () => new Uint8Array(),
    isEmpty: () => true,
    resize: () => nativeImage.createEmpty(),
  }),
  createFromPath: () => nativeImage.createEmpty(),
  createFromBuffer: () => nativeImage.createEmpty(),
  createFromDataURL: () => nativeImage.createEmpty(),
};

export const TouchBar = class TouchBar {
  static TouchBarButton = class {};
  static TouchBarLabel = class {};
  static TouchBarSpacer = class {};
  static TouchBarSegmentedControl = class {};
  static TouchBarScrubber = class {};
};

export const nativeTheme = {
  shouldUseDarkColors: true,
  themeSource: 'dark',
};

export const webFrame = {
  executeJavaScript: () => {},
  executeJavaScriptInIsolatedWorld: () => {},
  setZoomFactor: () => {},
  getZoomFactor: () => 1,
};

export const contextBridge = {
  exposeInMainWorld: () => {},
};

export const BrowserWindow = class BrowserWindow {};
export const Menu = class Menu {};
export const MenuItem = class MenuItem {};
export const Tray = class Tray {};

export default {
  ipcRenderer,
  shell,
  dialog,
  net,
  app,
  globalShortcut,
  nativeImage,
  TouchBar,
  nativeTheme,
  webFrame,
  contextBridge,
  BrowserWindow,
  Menu,
  MenuItem,
  Tray,
};
