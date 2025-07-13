
# BUBT VTS 2.0

A full-stack web application that displays and tracks bus routes in real time using FastAPI, Firebase Realtime Database, and Leaflet.js.

---

## Prerequisites

- **Node.js** (v14+)
- **npm** (v6+)
- **Python** (v3.7+)
- **pip**
- **Virtual environment tool** (e.g., `venv`)
- **Firebase service account JSON** file (stored securely, outside the repo)

---

## Project Structure

```
project-root/
├── backend/
│   ├── server.py
│   ├── requirements.txt
│   └── .env               ← contains FIREBASE_DB_URL (and optional dotenv secrets)
└── frontend/
    ├── index.html
    ├── package.json
    ├── webpack.config.js
    └── src/
       └── main.js
```

---

## Environment Variables

Create a `.env` file in `backend/` (add to `.gitignore`):
```
# path to your Firebase service account (GOOGLE_APPLICATION_CREDENTIALS is file-URL set externally)
# FIREBASE_SERVICE_ACCOUNT_JSON optional if using ADC
FIREBASE_DB_URL=https://<YOUR-PROJECT-ID>.firebaseio.com
```

Additionally, set:
- **GOOGLE_APPLICATION_CREDENTIALS** → path to service account JSON on disk:
  ```bash
  # macOS/Linux
  export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/serviceAccount.json"

  # Windows (PowerShell)
  setx GOOGLE_APPLICATION_CREDENTIALS "C:\secure\path\serviceAccount.json"
  ```

---

## Backend Setup (FastAPI)

1. **Navigate** to the backend folder:
   ```bash
   cd project-root/backend
   ```

2. **Create** and **activate** a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate             # macOS/Linux
   .\venv\Scripts\Activate.ps1       # Windows PowerShell
   ```

3. **Install** Python dependencies:
   ```bash
   pip install fastapi uvicorn httpx firebase-admin python-dotenv
   ```

4. **Use** the provided `app.py` (FastAPI async server) or adapt as needed.

5. **Run** the FastAPI server:
   ```bash
   uvicorn app:app --reload --host 0.0.0.0 --port 5000
   ```

---

## Frontend Setup (Leaflet + Webpack)

1. **Navigate** to the frontend folder:
   ```bash
   cd project-root/frontend
   ```

2. **Install** Node.js dependencies:
   ```bash
   npm install
   ```

3. **Build** the production bundle:
   ```bash
   npm run build
   ```

This generates `dist/bundle.js`, served under `/static/bundle.js`.

---

## Development Workflow

- **Live coding (frontend):**
  ```bash
  # in frontend/
  npx webpack --watch
  ```
- **Live reload (backend):** uvicorn's `--reload` flag will pick up code changes.

---

## Viewing the App

Open your browser at:
```
http://localhost:5000/
```

Select a route, track buses in real time, search addresses, or input coordinates to draw custom routes.

---

## Security & Deployment Tips

- **Keep** your service account JSON outside version control.
- **Rotate** service account keys via Firebase console.
- **Authenticate** and **rate-limit** `/api/bus1` before public deployment.
- **Harden HTTP headers** with middleware (e.g., FastAPI-Talisman or Starlette middleware) to enforce CSP, HSTS, etc.
- **Use** a CDN/WAF (Cloudflare, AWS CloudFront) for DDoS protection.

---

## Benchmarking Performance

To compare Flask vs. FastAPI backend performance, follow these steps:

1. **Run both servers on different ports**
   - **Flask** (default port 5000):
     ```bash
     # in backend-flask/
     export FIREBASE_DB_URL="https://<PROJECT>.firebaseio.com"
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
     source venv/bin/activate   # or Windows equivalent
     python app.py --port 5000
     ```
   - **FastAPI** (port 5001):
     ```bash
     # in backend-fastapi/
     source venv/bin/activate
     uvicorn server:app --reload --host 0.0.0.0 --port 5001
     ```

2. **Select a benchmarking tool:** (e.g., `hey`)
   ```bash
   # Chocolatey on Windows
   choco install hey
   ```
3. **Run load tests:**
   ```bash
   # Benchmark Flask
   hey -n 10000 -c 100 http://localhost:5000/api/bus1 > flask_results.txt

   # Benchmark FastAPI
   hey -n 10000 -c 100 http://localhost:5001/api/bus1 > fastapi_results.txt
   ```

4. **Analyze results:** Compare throughput, latencies, error rates.

---

## Caching & Server-Push for High Load

**A. Eliminating duplicate Firebase hits**  
Polling 10 000 clients every 2 s means 5 000 Firebase calls per second—that alone will choke both your server and Firebase quotas.  
**Solution:** Cache the Bus1 JSON in memory for a short TTL (e.g. 1–2 s). All 1 000 req/s hit your cache, not Firebase.

**B. Server-Sent Events**  
Instead of polling, open an SSE connection per client. One backend fetch → broadcast update to all sockets.

---

## Right-size Concurrency & Workers on Render's 0.1 CPU

```bash
uvicorn app:app   --host 0.0.0.0   --port 5000   --workers 1   --limit-concurrency 100   --limit-max-requests 1000
```

This ensures you don’t overwhelm the 0.1 CPU, queues excess requests, and recycles the worker periodically.

---
