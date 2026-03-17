# MetroMate Backend

Express + MongoDB backend for MetroMate.

## Getting Started

### Install Dependencies
```bash
npm install
```

### Run the Server (Local)
```bash
npm start
```

The server will start on `http://localhost:5000` (or `PORT` if set).

## Deploy on Vercel

This backend is configured for Vercel using `vercel.json`.

1. Import this folder (`Safar-Backend`) as a Vercel project.
2. Add all required environment variables from `.env.example`.
3. Deploy.

Health endpoint:

- `GET /health`

## Python AI Service

The Python AI app (`ai_service.py`) should be deployed separately (Render/Railway/Fly.io), not as the same Node server process on Vercel.

Set this env var in backend/frontend where needed:

- `AI_SERVICE_URL=https://your-python-service-domain`

Then call Python endpoints via that public URL.

## Available Routes

- `GET /` - Welcome message
- `GET /api/hello` - Hello message from API
- `POST /api/echo` - Echo back the request body
