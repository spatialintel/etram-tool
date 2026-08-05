FROM node:22-alpine AS frontend

WORKDIR /build/webapp
COPY webapp/package.json webapp/package-lock.json ./
RUN npm ci
COPY webapp/ ./
RUN npm run build

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend /build/webapp/dist /app/webapp/dist

RUN mkdir -p /app/data/canonical /app/data/raw /app/data/jobs

EXPOSE 8080
CMD ["/bin/sh", "-c", "exec uvicorn etram:app --host 0.0.0.0 --port ${PORT:-8080}"]
