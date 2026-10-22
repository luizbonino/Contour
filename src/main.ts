import { createApp } from 'vue';
import { RECORD_I18N } from '@fairdatateam/record-core/i18n';
import App from './App.vue';
import { useI18n } from './composables/useI18n';

// Self-hosted brand fonts (latin subset — covers EN + pt-BR).
// assetsInlineLimit: Infinity inlines these into the single-file build.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';

import './style.css';

// The shared form renderer translates through Contour's i18n (same keys, all
// locales, reactive to the language switch).
const { t } = useI18n();
createApp(App).provide(RECORD_I18N, { t }).mount('#app');
