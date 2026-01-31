# Royalty Charts

Royalty Charts is an offline-first PWA trading journal for forex and synthetic instruments. It stores everything locally in IndexedDB and runs entirely in the browser.

## Run locally

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Deploy

### GitHub Pages

1. Push this repository to GitHub.
2. In GitHub, go to **Settings → Pages**.
3. Set the source to your default branch and `/root`.
4. Save and open the provided Pages URL.

### Netlify

1. Drag and drop the folder into Netlify, or connect the repo.
2. Use the default settings (no build command).

## Install on phone

1. Open the deployed URL in your phone browser.
2. Tap **Install** in the app header or use the browser menu → **Add to Home Screen**.
3. The app will work offline after the first load.
