#!/usr/bin/env bash
set -o errexit

echo "=== Step 1: Installing requirements ==="
pip install -r requirements.txt

echo "=== Step 2: Collecting static files ==="
python manage.py collectstatic --noinput || echo "WARNING: collectstatic failed but continuing..."

echo "=== Step 3: Running migrations ==="
python manage.py migrate

echo "=== Build complete! ==="
