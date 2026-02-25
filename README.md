# 🌐 cURL Online

A secure, lightweight, mobile-friendly HTTP client — like Postman but runs in your browser.

**[🚀 Live Demo → https://noerarief23.github.io/curlhub-online/](https://noerarief23.github.io/curlhub-online/)**

---

## ✨ Features

- **HTTP Methods**: GET, POST, PUT, PATCH, DELETE
- **Request Builder**: URL, Headers (key-value editor), Query Params, Request Body
- **Body Formats**: Raw JSON, form-data, x-www-form-urlencoded
- **cURL Import**: Paste any cURL command and auto-parse into form fields
- **cURL Export**: Generate a cURL command from the form
- **Response Viewer**: Pretty JSON with collapsible nodes, status code, headers, timing, size
- **Tabs**: Request | Response | cURL Preview
- **Copy Buttons**: Copy response body or cURL command to clipboard
- **Dark / Light Theme**: Toggle with one click
- **Mobile-First**: Responsive UI that works on any screen size
- **Backend Proxy**: Optional Express proxy to bypass CORS restrictions

## 🛡️ Security Features

- Backend proxy with SSRF protection (blocks private/loopback IPs)
- Rate limiting (30 req/min per IP by default)
- Input validation & sanitization on all proxy requests
- Request timeout protection (30s default)
- No request history stored by default
- Request and response bodies are never logged (hostname and status code may be logged for debugging)
- Environment variables for all sensitive config
- Hop-by-hop header stripping
- Header injection prevention

---

## 🗂️ Project Structure

```
curlhub-online/
├── frontend/               # React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx         # Main application component
│   │   ├── main.jsx        # Entry point
│   │   └── index.css       # Tailwind import
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
├── backend/                # Node.js + Express proxy
│   ├── server.js           # Express proxy server
│   ├── package.json
│   └── .env.example
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages deployment
└── README.md
```

---

## 🚀 Quick Start

### Frontend Only (GitHub Pages / static hosting)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173/curlhub-online/](http://localhost:5173/curlhub-online/)

> Without the backend proxy, requests go directly from your browser. CORS restrictions from the target server may apply.

### With Backend Proxy (recommended for production)

**Backend:**

```bash
cd backend
cp .env.example .env
# Edit .env as needed
npm install
npm start
```

**Frontend:**

```bash
cd frontend
cp .env.example .env
# Set VITE_PROXY_URL=http://localhost:3001
npm install
npm run dev
```

Then toggle **Proxy** on in the app header to route requests through the backend.

---

## ⚙️ Configuration

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PROXY_URL` | `http://localhost:3001` | Backend proxy URL |

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `TIMEOUT_MS` | `30000` | Request timeout (ms) |
| `RATE_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_MAX` | `30` | Max requests per window/IP |
| `ALLOWED_ORIGINS` | localhost + GitHub Pages | CORS allowed origins |

---

## 🌍 GitHub Pages Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:

1. Builds the React frontend on every push to `main`
2. Deploys it to GitHub Pages automatically

**To enable GitHub Pages:**

1. Go to your repository **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow will deploy automatically

The live app will be available at:
```
https://<your-username>.github.io/curlhub-online/
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 |
| Styling | Tailwind CSS v4 |
| Backend | Node.js + Express 5 |
| Proxy | Native Node.js `http`/`https` |
| Rate Limiting | express-rate-limit |
| Deployment | GitHub Pages via Actions |

---

## 📄 License

MIT
