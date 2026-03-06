# # ── Stage 1: Builder ──────────────────────────────────────────────────────────
# FROM python:3.10-slim AS builder

# WORKDIR /app

# # System dependencies needed for OpenCV, EasyOCR, MediaPipe
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     libgl1 \
#     libglib2.0-0 \
#     libgomp1 \
#     libsm6 \
#     libxext6 \
#     libxrender-dev \
#     libfontconfig1 \
#     curl \
#     && rm -rf /var/lib/apt/lists/*

# # Copy and install Python dependencies
# COPY requirements.txt .
# RUN pip install --no-cache-dir --upgrade pip && \
#     pip install --no-cache-dir -r requirements.txt

# # ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# FROM python:3.10-slim

# WORKDIR /app

# # Runtime system libs
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     libgl1 \
#     libglib2.0-0 \
#     libgomp1 \
#     libsm6 \
#     libxext6 \
#     libxrender-dev \
#     libfontconfig1 \
#     && rm -rf /var/lib/apt/lists/*

# # Copy installed packages from builder
# COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
# COPY --from=builder /usr/local/bin /usr/local/bin

# # Copy application code (excluding dataset — too large)
# COPY main_app/ ./

# # EasyOCR model cache dir
# RUN mkdir -p /root/.EasyOCR

# EXPOSE 8000

# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]




# ── Single stage — no dlib compilation ───────────────────────────────────────
# dlib source compile = 15-20 min = HF timeout
# Fix: use pre-built wheel from Manylinux + insightface ONNX for face matching
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.10-slim

WORKDIR /app

# ── System deps (only what's actually needed — no build-essential/cmake) ──────
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libfontconfig1 \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps ───────────────────────────────────────────────────────────────
COPY requirements.txt .

# Install in order: torch first (big), then rest
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── App code ──────────────────────────────────────────────────────────────────
COPY main_app/ ./main_app/

RUN mkdir -p /root/.EasyOCR /root/.insightface

# HF Spaces runs as non-root user 1000
RUN useradd -m -u 1000 user && \
    chown -R user:user /app /root/.EasyOCR /root/.insightface
USER user

EXPOSE 7860
CMD ["uvicorn", "main_app.main:app", "--host", "0.0.0.0", "--port", "7860"]