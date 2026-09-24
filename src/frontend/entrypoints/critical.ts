import 'vite/modulepreload-polyfill';
import { VulpineLoader } from '@frontend/lib/vulpine_loader';
import { EventType } from '@frontend/lib/event_handler';

if (!customElements.get('vulpine-loader')) {
  customElements.define('vulpine-loader', VulpineLoader);
}

window.addEventListener(EventType.MENU_DRAWER_OPEN, (event) => {
  console.log('menu open', event);
});
