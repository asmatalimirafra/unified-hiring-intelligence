"""
Central configuration — single source of truth for every setting.
All values come from environment variables (loaded from backend/.env if
python-dotenv is installed). NO other file should contain literals for
URLs, credentials, model names, or business thresholds.
"""
import os

# Optional .env loading — works without python-dotenv too (e.g. on Colab
# where you can os.environ[...] = ... directly before importing services).
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass


def _require(key: str) -> str:
    """Fail fast at startup if a secret is missing — better than a cryptic
    connection error 5 minutes later."""
    value = os.getenv(key)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {key}. "
            f"Set it in backend/.env or the process environment."
        )
    return value


# ── Database ────────────────────────────────────────────────────────────────
MONGO_URI     = _require("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "test-positions")

# ── Qdrant ──────────────────────────────────────────────────────────────────
QDRANT_URL     = _require("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")   # empty for local Qdrant

# ── Ollama / Models ─────────────────────────────────────────────────────────
OLLAMA_BASE_URL     = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"
LLM_MODEL           = os.getenv("LLM_MODEL", "llama3.1:8b")
EMBEDDING_MODEL     = os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-en-v1.5")

# ── Business rules ──────────────────────────────────────────────────────────
ATS_REJECT_THRESHOLD = float(os.getenv("ATS_REJECT_THRESHOLD", "30"))

# ── CORS ────────────────────────────────────────────────────────────────────
CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]