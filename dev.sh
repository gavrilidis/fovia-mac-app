#!/bin/bash
trap 'kill 0' EXIT

(cd cloud-api && .venv/bin/python3 -m uvicorn app.main:app --reload --port 8000) &
(cd faceflow-client && npm run tauri dev) &

wait
