import os
import pathlib
import time
import asyncio
import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Validate config
DB_URL = os.getenv("FIREBASE_DB_URL")
if not DB_URL:
    raise RuntimeError("Missing FIREBASE_DB_URL environment variable")
BUS1_URL = DB_URL.rstrip("/") + "/Bus1.json"

# Create FastAPI app
app = FastAPI(title="Dynamic Multisegment Bus Route Planner (FastAPI)")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust in production
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Serve static files under /static
frontend_dist = pathlib.Path(__file__).parent.parent / "frontend" / "dist"
app.mount("/static", StaticFiles(directory=frontend_dist), name="static")

# Shared in-memory cache and subscribers list
cache = {"data": None, "timestamp": 0.0}
CACHE_TTL = 2.0  # seconds
subscribers: list = []

async def fetch_bus_data() -> dict:
    """Fetch fresh Bus1 data from Firebase."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(BUS1_URL)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed Firebase fetch")
        return resp.json()

async def broadcaster_task():
    """Background task to fetch & broadcast updates."""
    last = None
    while True:
        try:
            # Use cache to reduce load
            now = time.monotonic()
            if cache['data'] is None or (now - cache['timestamp']) > CACHE_TTL:
                data = await fetch_bus_data()
                cache['data'] = data
                cache['timestamp'] = now
            else:
                data = cache['data']

            if data != last:
                # Broadcast to all subscriber queues
                for queue in list(subscribers):
                    await queue.put(data)
                last = data
        except Exception:
            # ignore fetch errors and retry
            pass
        await asyncio.sleep(CACHE_TTL)

@app.on_event("startup")
async def startup_event():
    # launch background broadcaster
    asyncio.create_task(broadcaster_task())

@app.get("/api/bus1")
async def bus1() -> dict:
    """Return latest cached Bus1 data."""
    now = time.monotonic()
    if cache['data'] is None or (now - cache['timestamp']) > CACHE_TTL:
        # ensure cache warmed
        cache['data'] = await fetch_bus_data()
        cache['timestamp'] = now
    return cache['data']

@app.get("/stream/bus1")
async def stream_bus1(request: Request):
    """SSE endpoint: broadcast same data to all clients simultaneously."""
    # create a personal queue for this client
    queue: asyncio.Queue = asyncio.Queue()
    subscribers.append(queue)

    async def event_generator():
        try:
            while True:
                # disconnect check
                if await request.is_disconnected():
                    break
                data = await queue.get()
                yield f"data: {json.dumps(data)}\n\n"
        finally:
            subscribers.remove(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/{full_path:path}")
async def serve_ui(full_path: str) -> FileResponse:
    """Serve static assets and fallback to index.html for SPA routing."""
    frontend_root = pathlib.Path(__file__).parent.parent / "frontend"
    candidate = frontend_root / full_path
    if full_path and candidate.exists():
        return FileResponse(candidate)
    return FileResponse(frontend_root / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        reload=True
    )
