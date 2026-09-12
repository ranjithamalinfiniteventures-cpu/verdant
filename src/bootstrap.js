import { platform } from './core/platform.js';

// Saved progress must be available before armory, vault, story or audio read
// it. Import the game only after the optional portal connection has settled.
window.VERDANT_BOOTING = true;
platform.loadingStart();
platform.init().then(() => import('./main.js')).catch(error => {
  window.dispatchEvent(new ErrorEvent('error', { message: error.message, error }));
}).finally(() => { window.VERDANT_BOOTING = false; });
