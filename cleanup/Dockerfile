FROM python:3.12-slim

ARG WITH_FACE=false
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt requirements-face.txt ./
# SQLCipher: prebuilt wheel on x86_64; on ARM (e.g. Apple Silicon) build against libsqlcipher
RUN if [ "$(uname -m)" != "x86_64" ]; then \
      apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev libsqlcipher-dev && \
      rm -rf /var/lib/apt/lists/*; \
    fi && pip install -r requirements.txt
# Optional local face matching (builds dlib: takes a while and needs ~2 GB RAM)
RUN if [ "$WITH_FACE" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends build-essential cmake && \
      pip install -r requirements-face.txt && \
      apt-get purge -y build-essential cmake && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*; \
    fi

COPY app ./app
RUN useradd --create-home --uid 10001 cleanup && mkdir -p /data && chown cleanup /data
USER cleanup
ENV DATA_DIR=/data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
