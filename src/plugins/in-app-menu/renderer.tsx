import { createSignal, ErrorBoundary } from 'solid-js';
import { render } from 'solid-js/web';

import { APPLICATION_NAME } from '@/i18n';

import { defaultInAppMenuConfig, type InAppMenuConfig } from './constants';
import { TitleBar } from './renderer/TitleBar';

import type { RendererContext } from '@/types/contexts';

const scrollStyle = `
  html::-webkit-scrollbar {
    background-color: red;
  }
`;

const isMacOS = navigator.userAgent.includes('Macintosh');
const isNotWindowsOrMacOS =
  !navigator.userAgent.includes('Windows') && !isMacOS;

const [config, setConfig] = createSignal<InAppMenuConfig>(
  defaultInAppMenuConfig,
);
export const onRendererLoad = async ({
  getConfig,
  ipc,
}: RendererContext<InAppMenuConfig>) => {
  console.log('[in-app-menu] onRendererLoad initializing...');
  setConfig(await getConfig());

  document.title = APPLICATION_NAME;
  try {
    const stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(scrollStyle);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet];
  } catch (err) {
    console.warn('[in-app-menu] adoptedStyleSheets failed:', err);
  }

  const mountTitleBar = () => {
    const container = document.body || document.documentElement;
    if (!container) {
      setTimeout(mountTitleBar, 10);
      return;
    }
    console.log('[in-app-menu] Rendering TitleBar into container');
    render(
      () => (
        <ErrorBoundary fallback={(err) => {
          console.error('[in-app-menu] TitleBar crashed:', err);
          return null;
        }}>
          <TitleBar
            enableController={
              isNotWindowsOrMacOS && !config().hideDOMWindowControls
            }
            initialCollapsed={window.mainConfig.get('options.hideMenu')}
            ipc={ipc}
            isMacOS={isMacOS}
          />
        </ErrorBoundary>
      ),
      container,
    );
  };

  mountTitleBar();
};

export const onPlayerApiReady = () => {
  // NOT WORKING AFTER YTM UPDATE (last checked 2024-02-04)
  //
  // const htmlHeadStyle = document.querySelector('head > div > style');
  // if (htmlHeadStyle) {
  //   // HACK: This is a hack to remove the scrollbar width
  //   htmlHeadStyle.innerHTML = htmlHeadStyle.innerHTML.replace(
  //     'html::-webkit-scrollbar {width: var(--ytmusic-scrollbar-width);',
  //     'html::-webkit-scrollbar { width: 0;',
  //   );
  // }
};

export const onConfigChange = (newConfig: InAppMenuConfig) => {
  setConfig(newConfig);
};
