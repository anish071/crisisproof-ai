import sys
from pathlib import Path

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from api import app  # noqa: E402

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["model_loaded"] is True

def test_disaster_prediction():
    response = client.post("/predict", json={"tweet": "A massive earthquake has destroyed several buildings."})
    assert response.status_code == 200
    assert response.json()["prediction"] == 1
    assert response.json()["classification"] == "Disaster-related"

def test_non_disaster_prediction():
    response = client.post("/predict", json={"tweet": "I love spending time with my friends."})
    assert response.status_code == 200
    assert response.json()["prediction"] == 0

def test_empty_tweet():
    assert client.post("/predict", json={"tweet": ""}).status_code == 422

def test_missing_tweet():
    assert client.post("/predict", json={}).status_code == 422

def test_invalid_tweet_type():
    assert client.post("/predict", json={"tweet": 123}).status_code == 422
