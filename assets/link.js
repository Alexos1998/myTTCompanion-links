/*
 * Share-link landing page logic.
 *
 * A share link is `https://alexos1998.github.io/myTTCompanion-links/s/<type>/?<coordinates>`.
 * When the app is installed and the host is verified, Android and iOS open the app
 * and this page is never rendered. Everything here is therefore the *fallback*: the
 * app is missing, App-Links verification has not happened yet, or the link was
 * opened in a desktop browser.
 *
 * Three exits are offered, in that order of usefulness:
 *   1. open the app through the custom scheme (works without any domain verification)
 *   2. look at the same thing on mytischtennis.de
 *   3. install the app
 *
 * No automatic scheme redirect: on iOS an unhandled custom scheme raises a modal
 * error, which is worse than a button the user does not press.
 */

/** GitHub project page prefix. Not part of the link grammar the app parses. */
const BASE_PATH = '/myTTCompanion-links';

const APP_SCHEME = 'myttr';
const DEBUG_SCHEME = 'myttr-debug';
const STORE_URL = 'https://play.google.com/store/apps/details?id=de.ajeddeloh.myttcompanion';

/** Reads the coordinates of the current link. */
function coordinates() {
  return new URLSearchParams(window.location.search);
}

/**
 * The same link as a custom-scheme URL: `myttr://s/player/?org=...`.
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
 * The equivalent page on mytischtennis.de, or null when the coordinates cannot
 * address a public page. Only the types that are actually wired return a URL.
 */
function webUrl(type, params) {
  const season = params.get('s') || '';

  if (type === 'player') {
    const pid = params.get('pid');
    if (!pid) return null;
    // Same shape the app fetches, minus the `?_data=` loader suffix. `XXXX` is
    // what the site itself accepts as a wildcard association segment.
    const org = params.get('org') || 'XXXX';
    const tf = season || 'aktuell';
    return `https://www.mytischtennis.de/click-tt/${org}/${tf}/spieler/${pid}/spielerportrait/single`;
  }

  return null;
}

/** Fills in the entity name when the link carries one, so the page is not anonymous. */
function applyName(params) {
  const name = (params.get('n') || '').trim().slice(0, 80);
  if (!name) return;

  const target = document.querySelector('[data-entity-name]');
  if (target) {
    target.textContent = name;
    target.hidden = false;
  }
  document.title = name + ' - myTischtennis Companion';
}

function wire() {
  const type = document.body.dataset.type;
  const params = coordinates();

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
  if (window.location.hash === '#debug') {
    const debug = document.querySelector('[data-action="open-debug"]');
    if (debug) {
      debug.href = appUrl(DEBUG_SCHEME);
      debug.hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', wire);
