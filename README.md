# CastroTide — animated tide scene

A single full-screen animated SVG scene for Castro-Urdiales (Cantabria): the
waterline rises/falls with the live tide, a countdown + arrow point to the next
high/low, the sun and moon traverse an arc across their real sky windows, clouds
drift with the wind and gray out when rain is forecast, and two pastel temperatures
float in the scene. Portrait phone PWA — install it from the browser menu.

No build step, no dependencies: plain HTML + SVG + JS.

## Data sources

- **Tides** — the server-rendered table from tideschart.com (Puertos del Estado
  predictions), fetched client-side (the site sends `access-control-allow-origin: *`).
  Last-good table is kept in localStorage for offline / Cloudflare-hiccup resilience.
- **Weather** — Open-Meteo forecast API (air temp, cloud cover, wind, rain risk,
  sunrise/sunset).
- **Sea** — Open-Meteo marine API (sea surface temperature).

No API keys required.

## Live demo

GitHub Pages: enable it under Settings → Pages → Deploy from branch (`main`, `/`),
then open `https://dutchdan.github.io/castro-tide-scene/`.

Spec: see `SPEC.md` in the project folder (this repo is the build it describes).
Predecessor: [dutchdan/castro-tides](https://github.com/dutchdan/castro-tides) (chart-based v1).

Predictions are a guide for recreation — not for navigation.
