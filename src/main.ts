import { createApp } from 'vue';
import App from './App.vue';

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

createApp(App).mount('#app');
