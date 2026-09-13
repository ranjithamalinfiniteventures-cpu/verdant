/* The portal layer: everything that differs between "a web page we host" and
   "a game embedded on CrazyGames", kept in one file so the rest of the game
   never has to know which it is running in.

   Two things matter here.

   Storage. The game runs in a cross-origin iframe on their domain, and Safari
   partitions (or refuses) third-party storage — so localStorage can silently
   lose every coin, perk and best wave between sessions, which looks exactly
   like a bug in the game. Their data module has the same API as localStorage
   and handles the platform side, so `storage` below prefers it, falls back to
   localStorage, and falls back again to memory rather than throwing.

   Gameplay events. The platform wants to know when the player is actually
   playing (so it never interrupts with an ad mid-fight) — gameplayStart when
   the fight is live, gameplayStop whenever a panel, transition or death takes
   over. `setPlaying()` is edge-triggered, so callers can say what the state is
   as often as they like.

   Sitelock is done by the SDK itself on start; there is deliberately no
   hostname check here, because a wrong one breaks the game for real players.

   When the SDK is absent — the web build, a downloaded build, tests — every
   call here quietly does nothing. */

/* Which portal this build is for, stamped in by tools/build.mjs. The generic
   "web" build (itch, Newgrounds, our own site) must make no third-party
   requests at all: Newgrounds' game guidelines require notice and an opt-out
   for any call to a third-party server, and a competitor portal's SDK has no
   business loading there anyway. So in that build the SDK URL is folded to an
   empty string and the loader never runs. Unbundled dev keeps it, for testing. */
const PORTAL = typeof __VERDANT_PORTAL__ === 'string' ? __VERDANT_PORTAL__ : 'dev';
/* The URLs compare the injected literal directly rather than going through
   PORTAL. esbuild can wrap this module in a lazy initialiser, which turns
   top-level consts into plain assignments it will not fold — so a comparison
   via PORTAL survived into the CrazyGames bundle and shipped the Y8 URL with it.
   A literal compared in place always folds, however the module is wrapped. */
const SDK_URL = (typeof __VERDANT_PORTAL__ === 'undefined' || __VERDANT_PORTAL__ === 'crazygames')
  ? 'https://sdk.crazygames.com/crazygames-sdk-v3.js' : '';
/* Y8 requires its SDK to be initialised to publish at all, though ads are
   optional and this build has none. Its app id is a public client identifier
   (it ships in every Y8 game's page source), not a secret. */
const Y8_URL = (typeof __VERDANT_PORTAL__ !== 'undefined' && __VERDANT_PORTAL__ === 'y8')
  ? 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js' : '';
const Y8_APP_ID = '6aa61bf60c9b919e9245296c';

/** Load and initialise Y8's SDK, never waiting more than ~2.5s for it. */
function initY8(){
  if (!Y8_URL || typeof document === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const done = ok => { if (!settled){ settled = true; resolve(ok); } };
    const timer = setTimeout(() => done(false), 2500);
    addEventListener('y8sdk.ready', () => {
      try {
        const y8sdk = globalThis.y8?.sdk?.();
        // appConfig only: no adConfig, so no ads are requested
        y8sdk?.init({ appId: Y8_APP_ID, autoLogin: true });
        y8sdk?.onAuth?.(() => {});
        clearTimeout(timer); done(!!y8sdk);
      } catch (e){ clearTimeout(timer); console.warn('[verdant] Y8 SDK unavailable:', e?.message || e); done(false); }
    }, { once: true });
    const script = document.createElement('script');
    script.src = Y8_URL; script.async = true; script.dataset.optional = 'true';
    script.onload = () => { try { globalThis.y8?.emitReadyEvent?.(); } catch {} };
    script.onerror = () => { clearTimeout(timer); done(false); };
    document.head.appendChild(script);
  });
}

const sdk = () => globalThis.CrazyGames?.SDK || null;

let ready = false, environment = 'disabled', initializing, loadingStarted = false;
function deadline(promise, ms){
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Portal connection timed out')), ms);
  })]).finally(() => clearTimeout(timer));
}

async function loadSdk(){
  if (!SDK_URL) return null;                     // the web build has no portal
  if (sdk() || typeof document === 'undefined') return sdk();
  await new Promise(resolve => {
    const script = document.createElement('script');
    script.id = 'crazygames-sdk';
    script.dataset.optional = 'true';
    script.src = SDK_URL;
    script.async = true;
    const timer = setTimeout(resolve, 1500);     // the SDK is optional: never wait long for it
    script.onload = script.onerror = () => { clearTimeout(timer); resolve(); };
    document.head.appendChild(script);
  });
  return sdk();
}

// SDK methods can reject asynchronously, including on non-portal hosts.
// Catch promises as well as synchronous exceptions so an optional integration
// cannot put a fatal error banner over a running game.
function gameEvent(name){
  if (!ready) return false;
  try {
    const result = sdk()?.game?.[name]?.();
    Promise.resolve(result).catch(() => {});
    return true;
  } catch { return false; }
}

export const platform = {
  get available(){ return ready; },
  get environment(){ return environment; },

  init(){
    if (initializing) return initializing;
    initializing = (async () => {
      if (PORTAL === 'y8'){ await initY8(); return false; }   // no CrazyGames features on Y8
      const s = await loadSdk();
      if (!s) return false;
      try {
        /* Ask before knocking. On a domain the portal does not recognise, the
           SDK refuses every call — including init() — and the refusal arrives
           as a rejection the page's error reporter would otherwise show to the
           player. This is the check its own error message asks for. */
        if (s.environment === 'disabled'){ environment = 'disabled'; return false; }
        await deadline(s.init(), 2000);
        environment = s.environment || 'disabled';
        ready = environment === 'crazygames' || environment === 'local';
        if (ready && loadingStarted) gameEvent('loadingStart');
        return ready;
      } catch (e){ console.warn('[verdant] portal unavailable, using device saves:', e?.message || e); return false; }
    })();
    return initializing;
  },

  /* Loading: measured by the platform, and it wants the pair. */
  loadingStart(){
    if (loadingStarted) return;
    loadingStarted = true;
    // Bootstrap asks for this before the optional SDK has finished loading;
    // init() flushes it once the platform connection is ready.
    gameEvent('loadingStart');
  },
  loadingStop(){
    if (!loadingStarted) return;
    loadingStarted = false;
    gameEvent('loadingStop');
  },

  /** Edge-triggered: call it every time the state might have changed. */
  setPlaying(playing){
    if (!ready || playing === this._playing) return;
    this._playing = playing;
    gameEvent(playing ? 'gameplayStart' : 'gameplayStop');
  },
  _playing: false,

  /** A real moment — a boss falling, a tower escaped. Rare, by instruction. */
  happytime(){ gameEvent('happytime'); },

  /** How far through the game this player has got, 0-100. */
  reportProgress(pct){
    if (!ready) return;
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    try { Promise.resolve(sdk()?.game?.reportGameCompletedPercentage?.(v)).catch(() => {}); } catch {}
  },

  /* The portal can ask a game to go quiet — during an ad, or because the player
     muted the whole site. Read it once at start, then follow it. The callback
     also fires immediately with the current value, so the caller has one path.
     `?muteAudio=true` forces it on locally, which is how this is tested. */
  onSettings(cb){
    const read = () => { try { return sdk()?.game?.settings || {}; } catch { return {}; } };
    const push = (s) => { try { cb(s || read()); } catch {} };
    push(read());
    try { sdk()?.game?.addSettingsChangeListener?.(push); } catch {}
    // the SDK may only arrive later; re-read once it has
    Promise.resolve(initializing).then(() => {
      push(read());
      try { sdk()?.game?.addSettingsChangeListener?.(push); } catch {}
    }).catch(() => {});
  },

  /* The signed-in player. Full Launch wants their CrazyGames name used rather
     than asking for another one; `null` means "ask the player", which is what
     happens everywhere else. */
  async user(){
    const s = sdk();
    if (!ready || !s?.user) return null;
    try {
      if (s.user.isUserAccountAvailable === false) return null;
      const u = await s.user.getUser();
      return u?.username ? { name: u.username, avatar: u.profilePictureUrl || null } : null;
    } catch { return null; }
  },
};

/* --------------------------------------------------------------- storage --
   The same shape as localStorage, so call sites read the same as before. */
const memory = new Map();
const backend = () => {
  // The local SDK supplies mock data. Actual portal saves use its Data module;
  // our own site and development keep their existing localStorage progress.
  if (ready && environment === 'crazygames') return sdk()?.data || null;
  try {
    if (typeof localStorage !== 'undefined'){ localStorage.getItem('verdant.probe'); return localStorage; }
  } catch {}                             // Safari in a third-party iframe throws on access itself
  return null;
};

export const storage = {
  getItem(key){
    try { const b = backend(); if (b) return b.getItem(key) ?? memory.get(key) ?? null; } catch {}
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value){
    memory.set(key, String(value));      // kept regardless, so a session is never lost mid-run
    try { backend()?.setItem(key, String(value)); } catch {}
  },
  removeItem(key){
    memory.delete(key);
    try { backend()?.removeItem(key); } catch {}
  },
  /** false when nothing will survive a reload — worth telling the player once. */
  get durable(){ return !!backend(); },
};
