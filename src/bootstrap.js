import { platform } from './core/platform.js';

/* Boot marks. The portal measures load time from the page opening to the first
   gameplay event, and without these there is no way to see which part of that
   is download, which is parsing three.js, and which is building the first
   room. `performance.getEntriesByType('measure')` has the answer in any
   environment, including the portal's QA. */
performance.mark('verdant:boot');

/* Saved progress must be available before armory, vault, story or audio read it,
   so the game starts once the portal connection has settled — but that wait is
   now capped hard (1.5s for the script, 2s for its handshake). It used to allow
   ten seconds, which meant a slow portal could hold a game that is ready in
   under a second, and the whole delay showed up as OUR load time.

   The mark below records exactly how long the portal took, so the next time a
   load looks slow the console says whether it was us or the wait. */
window.VERDANT_BOOTING = true;
platform.loadingStart();
const sdkStart = performance.now();
platform.init().then(() => {
  performance.mark('verdant:portal');
  const waited = Math.round(performance.now() - sdkStart);
  if (waited > 250) console.info(`[verdant] waited ${waited}ms for the portal SDK before starting`);
  return import('./main.js');
}).catch(error => {
  window.dispatchEvent(new ErrorEvent('error', { message: error.message, error }));
}).finally(() => { window.VERDANT_BOOTING = false; });
