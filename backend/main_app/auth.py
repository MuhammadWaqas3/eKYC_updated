"""
auth.py — JWT verification supporting both ES256 (Supabase asymmetric) and HS256.

Supabase now issues ES256 tokens signed with asymmetric keys.
Public keys are fetched from: {SUPABASE_URL}/auth/v1/.well-known/jwks.json
HS256 (legacy) is kept as a fallback using SUPABASE_JWT_SECRET.
"""

import os
import httpx
import jwt as pyjwt                      # PyJWT
from jwt import PyJWKClient, InvalidTokenError
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()

SUPABASE_URL      = os.getenv("SUPABASE_URL", "https://byztworxoersmypkqngu.supabase.co")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
JWKS_URL          = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

# PyJWT JWKS client — caches keys automatically, refreshes on new kid
_jwks_client: PyJWKClient | None = None

def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(JWKS_URL, cache_keys=True)
        print(f"[AUTH] PyJWKClient initialised → {JWKS_URL}")
    return _jwks_client


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials

    # Peek at header (no verification yet)
    try:
        header = pyjwt.get_unverified_header(token)
    except pyjwt.exceptions.DecodeError as e:
        raise HTTPException(status_code=403, detail=f"Malformed token: {e}")

    alg = header.get("alg", "HS256")

    # ── ES256 / RS256 → verify via Supabase JWKS public key ──────────────────
    if alg in ("ES256", "RS256"):
        try:
            client = _get_jwks_client()
            signing_key = client.get_signing_key_from_jwt(token)
            payload = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                options={"verify_aud": False},
            )
        except pyjwt.exceptions.PyJWKClientError as e:
            print(f"[AUTH] JWKS fetch/key error: {e}")
            raise HTTPException(status_code=403, detail=f"Unable to retrieve signing key: {e}")
        except InvalidTokenError as e:
            print(f"[AUTH] {alg} verify FAILED: {e}")
            raise HTTPException(status_code=403, detail=f"Invalid token: {e}")

    # ── HS256 → verify via shared JWT secret ─────────────────────────────────
    else:
        try:
            payload = pyjwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except InvalidTokenError as e:
            print(f"[AUTH] HS256 verify FAILED: {e}")
            raise HTTPException(status_code=403, detail=f"Invalid token: {e}")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    return payload