/*
 * Share-link landing page logic.
 *
 * A share link is `https://alexos1998.github.io/myTTCompanion-links/s/<type>/?<coordinates>`.
 * When the app is installed and the host is verified, Android and iOS open the app
 * and this page is never rendered. Everything here is therefore the *fallback*: the
 * app is missing, App-Links verification has not happened yet, or the link was
 * opened in a desktop browser.
 *
 * The page tries the app itself, immediately, through the custom scheme, and only
 * reveals its buttons when that demonstrably did not work. "Did not work" cannot be
 * observed directly - no browser reports whether a scheme was handled - so it is
 * inferred: if the app opens, this page loses visibility within a moment. Still
 * visible after [FALLBACK_DELAY_MS], and the app is not there.
 *
 * Three exits are then offered, in that order of usefulness:
 *   1. retry the app through the custom scheme
 *   2. look at the same thing on mytischtennis.de
 *   3. install the app
 */

/** GitHub project page prefix. Not part of the link grammar the app parses. */
const BASE_PATH = '/myTTCompanion-links';

const APP_SCHEME = 'myttcompanion';
const DEBUG_SCHEME = 'myttcompanion-debug';
const STORE_URL = 'https://play.google.com/store/apps/details?id=de.ajeddeloh.myttcompanion';

/**
 * How long to wait before declaring the app absent. Long enough for Android's
 * intent resolution and the app's cold start to take the page out of view, short
 * enough that a visitor without the app is not left staring at a spinner.
 */
const FALLBACK_DELAY_MS = 1500;

/** Reads the coordinates of the current link. */
function coordinates() {
  return new URLSearchParams(window.location.search);
}

/**
 * The same link as a custom-scheme URL: `myttcompanion://s/player/?org=...`.
 *
 * The hosting prefix is stripped, so the app sees one grammar (`s/<type>/?...`)
 * whether the link arrived as an https App Link or as a custom scheme, and moving
 * the pages to another host or repo never changes what the app parses.
 */
function appUrl(scheme) {
  const path = window.location.pathname.replace(BASE_PATH, '').replace(/^\/+/, '');
  return scheme + '://' + path + window.location.search;
}

/**
 * The click-tt player id (`P<hex><checksum>`) derived from the numeric id.
 *
 * Mirrors `PlayerIdParser.encode` in the app, which in turn mirrors
 * mytischtennis' own JS: rotate left by 3 in 32 bits, then a two-digit hex
 * checksum over the decimal digits. A link carries only the numeric id, so
 * both sides derive this rather than transporting a value that could disagree
 * with the id next to it.
 */
function clickTtPlayerId(numericId) {
  const value = numericId >>> 0;
  const rotated = ((value << 3) | (value >>> 29)) >>> 0;

  let sum = 0;
  for (const digit of String(numericId)) sum += Number(digit);
  const checksum = (sum % 256).toString(16).padStart(2, '0').toUpperCase();

  return 'P' + rotated.toString(16).toUpperCase() + checksum;
}

/**
 * The current click-tt season token, e.g. "26--27". Mirrors `SeasonHelper` in
 * the app: the season runs from July to June.
 */
function currentSeason() {
  const now = new Date();
  const start = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const two = (year) => String(year % 100).padStart(2, '0');
  return `${two(start)}--${two(start + 1)}`;
}

/**
 * The equivalent page on mytischtennis.de, or null when the coordinates cannot
 * address a public page.
 *
 * These are the same URLs the app fetches, minus the `?_data=` loader suffix,
 * so a recipient without the app still sees the thing that was shared. `XXXX`
 * is the wildcard the site itself accepts where a name would go.
 */
function webUrl(type, params) {
  const org = params.get('org');
  const id = params.get('id');
  const season = params.get('s') || currentSeason();
  const tf = params.get('tf') || 'gesamt';
  const clickTt = (path) => `https://www.mytischtennis.de/click-tt/${path}`;

  if (type === 'player') {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return null;
    return clickTt(`XXXX/${season}/spieler/${clickTtPlayerId(numericId)}/spielerportrait/single`);
  }

  if (!org) return null;

  if (type === 'league' && id) {
    const view = params.get('v');
    const group = `${org}/${season}/ligen/-/gruppe/${id}`;
    if (view === 'schedule') return clickTt(`${group}/spielplan/${tf}`);
    if (view === 'ranking') return clickTt(`${group}/gruppen-ranglisten/spieler/${tf}`);
    if (view === 'stats') return clickTt(`${group}/mannschaftsmeldungen/${tf === 'gesamt' ? 'vr' : tf}`);
    if (view === 'balance') return clickTt(`${group}/bilanzuebersichten/${tf}`);
    // Contacts is the one league page that takes a placeholder segment.
    if (view === 'contacts') return clickTt(`${org}/${season}/ligen/XXX/gruppe/${id}/kontakte`);
    return clickTt(`${group}/tabelle/${tf}`);
  }

  if (type === 'team' && id && params.get('g')) {
    const team = `${org}/${season}/ligen/-/gruppe/${params.get('g')}/mannschaft/${id}/XXX`;
    return clickTt(params.get('v') === 'lineup' ? `${team}/spielerbilanzen/${tf}` : `${team}/spielplan/${tf}`);
  }

  if (type === 'club' && id) {
    const club = `${org}/${season}/verein/${id}/XXX`;
    const view = params.get('v');
    if (view === 'schedule') return clickTt(`${club}/spielplan`);
    if (view === 'lineups') return clickTt(`${club}/meldungen`);
    if (view === 'meldung' && params.get('ag')) {
      return clickTt(`${club}/meldungendetails/${encodeURIComponent(params.get('ag'))}/${tf === 'gesamt' ? 'vr' : tf}`);
    }
    if (view === 'contacts' || view === 'locations') return clickTt(`${club}/info`);
    return clickTt(`${club}/mannschaften`);
  }

  if (type === 'tournament') {
    const competition = params.get('comp');
    if (competition) return clickTt(`${org}/konkurrenz/${competition}`);
    if (id) return clickTt(`${org}/turnier/${id}`);
    return clickTt(`${org}/turnierkalender`);
  }

  // A match report has no public click-tt page: the app reads it from the live
  // API, which answers JSON only.
  return null;
}

/**
 * Fills in the entity name when the link carries one, so the page is not
 * anonymous. A player carries it split (`fn`/`ln`, because the app needs both
 * halves), everything else as one `n`.
 */
function applyName(params) {
  const name = (params.get('n') || [params.get('fn'), params.get('ln')].filter(Boolean).join(' '))
    .trim()
    .slice(0, 80);
  if (!name) return;

  const target = document.querySelector('[data-entity-name]');
  if (target) {
    target.textContent = name;
    target.hidden = false;
  }
  document.title = name + ' - myTischtennis Companion';
}

/**
 * Reveals the buttons. Called when the app did not take over, and when the user
 * comes back from it, so the page is never left showing a spinner forever.
 */
function showFallback() {
  document.body.dataset.state = 'fallback';
}

/**
 * Hands the link to the app, then waits to see whether that worked.
 *
 * `location.href` rather than a click on a hidden anchor: a scheme navigation
 * that nothing handles leaves the document untouched in every current browser,
 * so the page survives to show its fallback.
 */
function launchApp(scheme) {
  let settled = false;

  const settle = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
  };

  // The app opening takes this page out of view. Any of these firing means the
  // launch worked, so the fallback must not flash up behind the app.
  const onHidden = () => {
    if (document.visibilityState === 'hidden') settle();
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', settle);
  window.addEventListener('blur', settle);

  const timer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    showFallback();
  }, FALLBACK_DELAY_MS);

  window.location.href = appUrl(scheme);
}

function wire() {
  const type = document.body.dataset.type;
  const params = coordinates();
  const debugRequested = window.location.hash === '#debug';

  applyName(params);

  const open = document.querySelector('[data-action="open-app"]');
  if (open) open.href = appUrl(APP_SCHEME);

  const store = document.querySelector('[data-action="install"]');
  if (store) store.href = STORE_URL;

  const web = document.querySelector('[data-action="open-web"]');
  const target = webUrl(type, params);
  if (web) {
    if (target) {
      web.href = target;
    } else {
      web.hidden = true;
    }
  }

  // Debug build. Both variants can claim the same host, so a tapped link offers a
  // chooser; this is the deterministic way in while testing. Hidden unless the link
  // asks for it with `#debug`, so a normal recipient never sees it.
  if (debugRequested) {
    const debug = document.querySelector('[data-action="open-debug"]');
    if (debug) {
      debug.href = appUrl(DEBUG_SCHEME);
      debug.hidden = false;
    }
  }

  // The landing page itself addresses nothing, so it has nothing to hand over.
  if (!document.querySelector('[data-launching]')) {
    showFallback();
    return;
  }

  // Coming back from the app, or navigating back to this page, must not bounce
  // the visitor straight out again.
  if (sessionStorage.getItem(launchKey()) === 'done') {
    showFallback();
    return;
  }
  sessionStorage.setItem(launchKey(), 'done');

  launchApp(debugRequested ? DEBUG_SCHEME : APP_SCHEME);
}

/** One launch per link per tab session. */
function launchKey() {
  return 'launched:' + window.location.pathname + window.location.search + window.location.hash;
}

// A page restored from the back/forward cache re-runs neither the script nor
// DOMContentLoaded, so its spinner would stay frozen. `pageshow` covers that.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) showFallback();
});

document.addEventListener('DOMContentLoaded', wire);
