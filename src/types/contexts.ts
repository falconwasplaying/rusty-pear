import type { PluginConfig } from '@/types/plugins';

export interface PearEventBus {
  send: (channel: string, ...args: unknown[]) => void;
  handle?: (event: string, listener: CallableFunction) => void;
  on: (event: string, listener: CallableFunction) => void;
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
  removeAllListeners?: (event: string) => void;
  removeHandler?: (event: string) => void;
}

export interface PearHostBackend {
  windowId: string;
  events: PearEventBus;
}

export interface BaseContext<Config extends PluginConfig> {
  getConfig: () => Promise<Config> | Config;
  setConfig: (conf: Partial<Omit<Config, 'enabled'>>) => Promise<void> | void;
}

export interface BackendContext<
  Config extends PluginConfig,
> extends BaseContext<Config> {
  host?: PearHostBackend;
  windowId?: string;
  events?: PearEventBus;

  // Compatibility surface for legacy plugins during migration
  ipc: {
    send: (channel: string, ...args: unknown[]) => void;
    handle: (event: string, listener: CallableFunction) => void;
    on: (event: string, listener: CallableFunction) => void;
    removeHandler: (event: string) => void;
  };

  window: unknown;
}

export interface MenuContext<
  Config extends PluginConfig,
> extends BaseContext<Config> {
  window: unknown;
  refresh: () => Promise<void> | void;
}

/* oxlint-disable typescript/no-empty-object-type */
export interface PreloadContext<
  Config extends PluginConfig,
> extends BaseContext<Config> {}
/* oxlint-enable typescript/no-empty-object-type */

export interface RendererContext<
  Config extends PluginConfig,
> extends BaseContext<Config> {
  ipc: {
    send: (channel: string, ...args: unknown[]) => void;
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (event: string, listener: CallableFunction) => void;
    removeAllListeners: (event: string) => void;
  };
}
