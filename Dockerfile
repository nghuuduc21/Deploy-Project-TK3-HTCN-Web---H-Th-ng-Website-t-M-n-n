FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app

ENV FLASK_APP=app.py
EXPOSE 5000

CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]

