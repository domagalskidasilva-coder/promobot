FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt requirements-collector.txt ./
RUN pip install --no-cache-dir -r requirements-collector.txt

COPY . .

EXPOSE 8000
# O scheduler é process-local: um único worker evita ciclos duplicados.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-graceful-shutdown", "45"]
