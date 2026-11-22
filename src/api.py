from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from logging_config import get_logger
from predictor import CrisisPredictor

logger = get_logger("CRISISPROOF.API")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = PROJECT_ROOT / "models" / "crisisproof_model_v1.joblib"
crisis_engine = CrisisPredictor(MODEL_PATH)

app = FastAPI(title="CRISISPROOF API", description="Crisis intelligence prototype API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
class PredictionRequest(BaseModel):
    tweet: str = Field(min_length=1, max_length=5000)

@app.get("/")
def root():
    return {"project":"CRISISPROOF", "message":"Crisis Intelligence API is running", "version":"1.0.0"}

@app.get("/health")
def health_check():
    return {"status":"healthy", "service":"CRISISPROOF API", "model_loaded":crisis_engine is not None, "model_version":crisis_engine.model_version}

@app.post("/predict")
def predict_crisis(request: PredictionRequest):
    try:
        result = crisis_engine.predict(request.tweet)
        logger.info("Prediction completed | classification=%s", result["classification"])
        return result
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Unexpected prediction error")
        raise HTTPException(status_code=500, detail="Internal prediction error") from error

def _usgs_events(period: str):
    # USGS public GeoJSON feed. This is live earthquake activity, not a crisis-risk forecast.
    now = datetime.now(timezone.utc)
    start = now - (timedelta(days=1) if period == "day" else timedelta(days=7))
    start_text = start.strftime("%Y-%m-%dT%H:%M:%S")
    end_text = now.strftime("%Y-%m-%dT%H:%M:%S")

    url = (
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson"
        f"&starttime={start_text}&endtime={end_text}&orderby=time&limit=100"
    )
    request = Request(url, headers={"User-Agent": "CRISISPROOF/1.0"})

    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("USGS feed unavailable: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="USGS earthquake feed is temporarily unavailable",
        ) from exc

    events = []

    for item in payload.get("features", []):
        props = item.get("properties", {})
        geometry = item.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []

        events.append({
            "event_id": item.get("id", "unknown"),
            "magnitude": props.get("mag"),
            "place": props.get("place") or "Unknown location",
            "time_utc": datetime.fromtimestamp(
                (props.get("time") or 0) / 1000, timezone.utc
            ).isoformat(),
            "source_url": props.get("url") or "https://earthquake.usgs.gov/",
            "longitude": coordinates[0] if len(coordinates) > 0 else None,
            "latitude": coordinates[1] if len(coordinates) > 1 else None,
        })

    return events

@app.get("/earthquakes")
def earthquakes(period: str = Query(default="day", pattern="^(day|week)$")):
    events = _usgs_events(period)
    return {"event_count":len(events), "events":events}

@app.get("/earthquakes/summary")
def earthquake_summary(period: str = Query(default="day", pattern="^(day|week)$")):
    events = _usgs_events(period)
    magnitudes = [e["magnitude"] for e in events if isinstance(e["magnitude"], (int, float))]
    latest = max(events, key=lambda e:e["time_utc"], default=None)
    return {"event_count":len(events), "max_magnitude":max(magnitudes) if magnitudes else None, "latest_event":latest}
