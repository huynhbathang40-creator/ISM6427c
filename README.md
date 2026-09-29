# Boca Weather

A responsive, live weather app powered by the free [Open-Meteo API](https://open-meteo.com/) (no API key needed). It defaults to Florida Atlantic University in Boca Raton, FL, and greets Viktor Huynh on arrival.

## Features

- Current conditions, a 24-hour hourly strip, and a 7-day forecast
- City search (Open-Meteo geocoding) and "My location" (browser geolocation)
- Light, Dark, and System themes, remembered between visits
- °F / °C toggle
- Auto-refreshes every 10 minutes and whenever the tab becomes visible again
- Responsive layout for phone, tablet, and desktop

## Run locally

It's plain HTML/CSS/JS with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to Netlify

- **Git deploy:** In Netlify, choose *Add new site → Import an existing project*, pick this repo and the `main` branch. `netlify.toml` already sets the publish directory to the repo root with no build command.
- **Drag and drop:** Drag the project folder onto https://app.netlify.com/drop.
- **CLI:** `npx netlify-cli deploy --prod --dir .`

## Files

- `index.html`: page markup
- `styles.css`: theming (CSS variables) and responsive layout
- `app.js`: data fetching, rendering, search, theme, and units
- `netlify.toml`: Netlify config
