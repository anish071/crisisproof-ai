# CRISISPROOF AI — full-stack prototype

A local crisis-intelligence prototype combining a trained text classifier, FastAPI backend, React/Vite dashboard, and USGS earthquake feed. It is a demonstration, not an emergency-response or forecasting system.

## Project layout

- `src/` — Python API, model inference, preprocessing, logging
- `models/crisisproof_model_v1.joblib` — trained model artifact
- `frontend/` — React + TypeScript + Vite dashboard
- `tests/` — backend tests
- `data/twitter_disaster.xlsx` — supplied training dataset copy

## Requirements

Python 3.10+ recommended; Node.js 20+ recommended.

## Setup (Windows)

1. Open Anaconda Prompt in this folder.
2. Install backend dependencies: `pip install -r requirements.txt`
3. Install frontend dependencies: `cd frontend` then `npm install`.
4. Return to the project root and double-click `start_crisisproof.bat`.
5. Open the local website URL printed by Vite. API docs are at `http://127.0.0.1:8000/docs`.

Run backend tests from the root with `python -m pytest tests/ -v`.

## Notes

The dashboard calls the backend through the Vite `/api` proxy. Earthquake events come from the public USGS feed and require an internet connection. The text classifier uses the included historical model artifact. A model label is only a text signal and must not be treated as confirmation of an active emergency. Live earthquake magnitudes are observations, not risk predictions. Human review is required.
