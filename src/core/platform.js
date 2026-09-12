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

   When the SDK is absent — our own site, itch, a downloaded build, tests —
   every call here quietly does nothing. */

const sdk = () => globalThis.CrazyGames?.SDK || null;

/* The SDK script is loaded async, so it may not be there yet on the first
   frame. Nothing here waits on it: calls made before it arrives are dropped,
   which is correct for events and harmless for the rest. */
let ready = false;
export const platform = {
  get available(){ return !!sdk(); },
  get environment(){ return sdk()?.environment || 'local'; },   // 'crazygames' | 'local' | 'disabled'

  async init(){
    const s = sdk();
    if (!s) return false;
    try {
      // v2 initialises itself; older builds expose an explicit init
      if (typeof s.init === 'function') await s.init();
      ready = true;
      return true;
    } catch (e){ console.warn('[verdant] platform SDK init failed:', e?.message || e); return false; }
  },

  /* Loading: measured by the platform, and it wants the pair. */
  loadingStart(){ try { sdk()?.game?.sdkGameLoadingStart?.(); } catch {} },
  loadingStop(){ try { sdk()?.game?.sdkGameLoadingStop?.(); } catch {} },

  /** Edge-triggered: call it every time the state might have changed. */
  setPlaying(playing){
    if (playing === this._playing) return;
    this._playing = playing;
    try {
      const g = sdk()?.game;
      if (playing) g?.gameplayStart?.(); else g?.gameplayStop?.();
    } catch {}
  },
  _playing: false,

  /** A real moment — a boss falling, a tower escaped. Rare, by instruction. */
  happytime(){ try { sdk()?.game?.happytime?.(); } catch {} },

  /* The signed-in player. Full Launch wants their CrazyGames name used rather
     than asking for another one; `null` means "ask the player", which is what
     happens everywhere else. */
  async user(){
    const s = sdk();
    if (!s?.user) return null;
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
  const d = sdk()?.data;
  if (d) return d;                       // survives their iframe; syncs for signed-in players
  try {
    if (typeof localStorage !== 'undefined'){ localStorage.getItem('verdant.probe'); return localStorage; }
  } catch {}                             // Safari in a third-party iframe throws on access itself
  return null;
};

export const storage = {
  getItem(key){
    try { const b = backend(); if (b) return b.getItem(key); } catch {}
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
