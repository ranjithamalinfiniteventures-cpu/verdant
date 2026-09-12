import { platform } from './core/platform.js';

/* Boot marks. The portal measures load time from the page opening to the first
   gameplay event, and without these there is no way to see which part of that
   is download, which is parsing three.js, and which is building the first
   room. `performance.getEntriesByType('measure')` has the answer in any
   environment, including the portal's QA. */
performance.mark('verdant:boot');

// Saved progress must be available before armory, vault, story or audio read
// it. Import the game only after the optional portal connection has settled.
window.VERDANT_BOOTING = true;
platform.loadingStart();
platform.init().then(() => import('./main.js')).catch(error => {
  window.dispatchEvent(new ErrorEvent('error', { message: error.message, error }));
}).finally(() => { window.VERDANT_BOOTING = false; });
