# cURL Online — Frontend

React 19 + Vite 7 + Tailwind CSS v4 single-page application.

## Development

```bash
# Install dependencies
npm install

# Start dev server (proxied to /curlhub-online/ base path)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Environment variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PROXY_URL` | `http://localhost:3001` | URL of the backend proxy server |

## Proxy mode

Toggle **Proxy** in the app header to route requests through the backend server instead of directly from the browser. This bypasses browser CORS restrictions. The backend URL is read from `VITE_PROXY_URL`.

## Production build

The build output goes to `dist/`. Set `VITE_PROXY_URL` at build time if the backend URL differs from the default:

```bash
VITE_PROXY_URL=https://your-backend.example.com npm run build
```

The `vite.config.js` sets `base: '/curlhub-online/'` for GitHub Pages deployment. Adjust this if deploying elsewhere.
