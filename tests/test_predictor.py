import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from predictor import CrisisPredictor  # noqa: E402

MODEL_PATH = PROJECT_ROOT / "models" / "crisisproof_model_v1.joblib"

@pytest.fixture
def engine():
    return CrisisPredictor(MODEL_PATH)

def test_disaster_prediction(engine):
    result = engine.predict("A massive earthquake has destroyed several buildings.")
    assert result["prediction"] == 1

def test_non_disaster_prediction(engine):
    result = engine.predict("I love spending time with my friends.")
    assert result["prediction"] == 0

def test_empty_input(engine):
    with pytest.raises(ValueError):
        engine.predict("")

def test_none_input(engine):
    with pytest.raises(TypeError):
        engine.predict(None)

def test_model_version(engine):
    assert engine.model_version == "1.0"
