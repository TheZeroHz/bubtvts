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

# List all your buses here
BUS_IDS = [f"Bus{i}" for i in range(1, 6)]  # ["Bus1", "Bus2", ..., "Bus5"]

# In‐memory cache and subscriber queues per bus
CACHE_TTL = 2.0  # seconds
cache = {bus: {"data": None, "timestamp": 0.0} for bus in BUS_IDS}
subscribers = {bus: [] for bus in BUS_IDS}

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


async def fetch_bus_data(bus_id: str) -> dict:
    """Fetch fresh data for a given bus from Firebase."""
    url = f"{DB_URL.rstrip('/')}/{bus_id}.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed Firebase fetch")
        return resp.json()


async def broadcaster_task(bus_id: str):
    """Background task: poll Firebase and push changes to all SSE subscribers."""
    last = None
    while True:
        try:
            now = time.monotonic()
            entry = cache[bus_id]
            # refresh cache if stale
            if entry["data"] is None or (now - entry["timestamp"]) > CACHE_TTL:
                data = await fetch_bus_data(bus_id)
                entry["data"] = data
                entry["timestamp"] = now
            else:
                data = entry["data"]

            if data != last:
                # broadcast to every subscriber queue for this bus
                for queue in list(subscribers[bus_id]):
                    await queue.put(data)
                last = data
        except Exception:
            # ignore & retry
            pass

        await asyncio.sleep(CACHE_TTL)


@app.on_event("startup")
async def startup_event():
    # start one broadcaster per bus
    for bus_id in BUS_IDS:
        asyncio.create_task(broadcaster_task(bus_id))


@app.get("/api/{bus_id}")
async def get_bus(bus_id: str):
    """Return latest cached data for Bus1–Bus5."""
    if bus_id not in BUS_IDS:
        raise HTTPException(status_code=404, detail="Unknown bus_id")
    entry = cache[bus_id]
    now = time.monotonic()
    # ensure cache is warmed
    if entry["data"] is None or (now - entry["timestamp"]) > CACHE_TTL:
        entry["data"] = await fetch_bus_data(bus_id)
        entry["timestamp"] = now
    return entry["data"]


@app.get("/stream/{bus_id}")
async def stream_bus(bus_id: str, request: Request):
    """SSE endpoint: stream updates for Bus1–Bus5."""
    if bus_id not in BUS_IDS:
        raise HTTPException(status_code=404, detail="Unknown bus_id")

    queue: asyncio.Queue = asyncio.Queue()
    subscribers[bus_id].append(queue)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                data = await queue.get()
                yield f"data: {json.dumps(data)}\n\n"
        finally:
            subscribers[bus_id].remove(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/{full_path:path}")
async def serve_ui(full_path: str) -> FileResponse:
    """Serve your SPA."""
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
