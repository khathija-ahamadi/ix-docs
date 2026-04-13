# iX Chatbot Backend

Express backend for the iX docs chatbot. It loads `docs.json` and `embeddings.json`, then serves chat and helper endpoints used by the docs frontend.

## Prerequisites

- Node.js 18+
- npm 9+

## Install

From the backend folder:

```bash
cd chatbot-backend
npm install
```

## Environment Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

2. Open `.env` and set at least one API key:

- `LLM_API_KEY` (Siemens LLM)
- or `SIEMENS_LLM_API_KEY`

Optional keys/settings:

- `GROQ_API_KEY` (if using Groq)
- `PORT` (default `5000`)
- `CORS_ORIGINS` (for example `http://localhost:3000`)
- `ALLOW_INSECURE_SSL=true` only when required behind a corporate TLS proxy

## Build Search Data (Optional)

Run this when docs content changes or when you want to refresh embeddings.

```bash
npm run build-all
```

Or run steps separately:

```bash
npm run build-docs
npm run build-embeddings
```

Notes:

- `build-docs` reads docs and blog content from the repository root.
- `build-embeddings` needs a valid provider API key.

## Run

Start the backend directly:

```bash
node server.js
```

Equivalent npm command:

```bash
npm start
```

By default, the server runs on:

`http://localhost:5000`

## Useful Scripts

- `npm run build-docs`
- `npm run build-embeddings`
- `npm run build-all`
- `node server.js`
- `npm start`
