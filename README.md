# myTTCompanion-links

Static landing pages for the share links of the app **myTischtennis Companion**
(`de.ajeddeloh.myttcompanion`). Served by GitHub Pages at

```
https://alexos1998.github.io/myTTCompanion-links/
```

There is no backend. A share link carries coordinates, not content: the app
refetches everything from mytischtennis.de, and this site only answers the case
where the app is not installed.

## Link grammar

```
https://alexos1998.github.io/myTTCompanion-links/s/<type>/?<coordinates>
```

`<type>` is a real directory with its own `index.html`, so the host answers 200
and every type can carry its own Open Graph preview. The coordinates live in the
query string, because a static host cannot produce a file per entity.

Implemented today:

| Type | Coordinates | Status |
|---|---|---|
| `player` | `pid` click-tt player id, `id` numeric statistics id, `v` view, `n` display name, `org` association, `s` season | **live** |
| `league`, `team`, `club`, `game`, `tournament` | see `SHARE_LINKS_PLAN.md` in the app repo | page exists, app side not wired |

Example:

```
https://alexos1998.github.io/myTTCompanion-links/s/player/?pid=NU1234567&id=98765&v=portrait&n=Max+Mustermann
```

The pages never interpret the coordinates beyond building the two outbound
links, so a newer app can ship new parameters without touching this repo.

## What a page does

On load it hands the link straight to the app as
`myttcompanion://s/<type>/?<query>` and shows nothing but a spinner. No browser
reports whether a scheme was handled, so success is inferred from the page losing
visibility: `visibilitychange`, `pagehide` or `blur` within 1.5 seconds means the
app took over, and the buttons are never revealed. Still visible after that, and
the app is not installed, so the page switches to its fallback:

1. **In der App öffnen** retries the same scheme link.
2. **Auf mytischtennis.de ansehen** builds the equivalent public page, currently
   for `player` only.
3. **App installieren** goes to the Play Store listing.
4. **In der Debug-App öffnen** appears only when the URL ends in `#debug` and uses
   the `myttcompanion-debug://` scheme, so a test link can address the debug build
   while both variants are installed. With `#debug` the automatic launch targets
   the debug build too.

The launch happens once per link per tab session (`sessionStorage`), so returning
from the app, or navigating back, does not bounce the visitor straight out again.
A page restored from the back/forward cache re-runs no script, which `pageshow`
handles by revealing the fallback.

With JavaScript disabled nothing sets the state and the buttons are visible: the
markup defaults to the safe side.

The `/myTTCompanion-links` prefix is stripped when building the scheme URL, so the
app parses one grammar regardless of transport and moving the site never changes
the parser.

## Why the well-known files are not in this repo

Android fetches `https://alexos1998.github.io/.well-known/assetlinks.json` and
Apple fetches `https://alexos1998.github.io/.well-known/apple-app-site-association`.
Neither respects a subpath, so a **project** page cannot host them. They live in
the sibling repo `Alexos1998.github.io` (a GitHub *user* page, which serves at
the domain root). Verification is per host, so the files there also cover the
`/myTTCompanion-links/s/` paths of this repo.

`.nojekyll` is present in both repos: Jekyll drops every path starting with a
dot, which silently 404s `.well-known/` and is the usual reason App Links look
broken on Pages.

## Deploying

Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`.
No build step, no Jekyll.

## Testing without waiting for verification

```sh
# Debug build, custom scheme, deterministic even with both variants installed
adb shell am start -a android.intent.action.VIEW \
  -d "myttcompanion-debug://s/player/?pid=NU1234567&id=98765&v=portrait&n=Max+Mustermann"

# https link against the debug package explicitly
adb shell am start -a android.intent.action.VIEW \
  -d "https://alexos1998.github.io/myTTCompanion-links/s/player/?pid=NU1234567" \
  de.ajeddeloh.myttcompanion.debug

# Verification state once assetlinks.json is live
adb shell pm get-app-links de.ajeddeloh.myttcompanion
```
