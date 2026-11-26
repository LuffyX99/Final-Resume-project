FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
# Containers run without CUDA; install the CPU wheel before project dependencies
# so sentence-transformers does not pull the much larger CUDA-enabled package.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir .

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
