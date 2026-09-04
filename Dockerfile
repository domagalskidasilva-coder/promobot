FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

# ClockBrowser na nuvem: Chrome real + Xvfb para o fallback CDP do ML
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb wget gnupg \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

ENV DISPLAY=:99

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt requirements-collector.txt ./
RUN pip install --no-cache-dir -r requirements-collector.txt

COPY . .

EXPOSE 8000
# O scheduler é process-local: um único worker evita ciclos duplicados.
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x800x24 -nolisten tcp & sleep 1; exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-graceful-shutdown 45"]
