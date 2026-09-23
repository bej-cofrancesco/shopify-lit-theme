import 'vite/modulepreload-polyfill';
import { VulpineLoader } from '@frontend/lib/vulpine-loader';
import '@components/event-trigger';

if (!customElements.get('vulpine-loader')) {
  customElements.define('vulpine-loader', VulpineLoader);
}
