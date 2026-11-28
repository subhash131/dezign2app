import { BetterAuthV16NodeData } from "../types";

/**
 * Generates `auth_middleware.py` for FastAPI services to verify tokens against Better Auth
 * or an external JWKS provider (/api/auth/jwks), with optional role enforcement.
 */
export function generateFastApiMiddleware(data: BetterAuthV16NodeData): string {
  const defaultUrl = data.baseUrl || `http://localhost:${data.port || "3000"}`;
  return `import os
import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

security = HTTPBearer()

AUTH_SERVER_URL = os.getenv("AUTH_SERVER_URL", os.getenv("BETTER_AUTH_URL", ${JSON.stringify(defaultUrl)}))
BETTER_AUTH_URL = os.getenv("BETTER_AUTH_URL", AUTH_SERVER_URL)
JWKS_URL = os.getenv("JWKS_URL", f"{AUTH_SERVER_URL}/api/auth/jwks")
BETTER_AUTH_SECRET = os.getenv("BETTER_AUTH_SECRET", "default_super_secret_key_change_in_production")

_jwks_client = None

def get_jwks_client():
    """Cache PyJWKClient at module scope so JWKS public keys are reused across requests."""
    global _jwks_client
    if _jwks_client is None:
        try:
            _jwks_client = jwt.PyJWKClient(JWKS_URL)
        except Exception:
            _jwks_client = None
    return _jwks_client

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    Validates Bearer token via:
    1. Asymmetric JWKS public keys (/api/auth/jwks — recommended for multi-server),
    2. Stateless HS256 JWT signature (test personas / internal tokens),
    3. Fallback to Better Auth /api/auth/get-session endpoint.
    """
    token = credentials.credentials
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Stateless JWKS Verification (EdDSA / RS256 / ES256)
    jwks_client = get_jwks_client()
    if jwks_client:
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["EdDSA", "RS256", "ES256"],
                options={"verify_aud": False},
            )
            user_id = payload.get("sub") or payload.get("id") or payload.get("userId") or payload.get("user_id")
            if payload and user_id:
                return {
                    "id": user_id,
                    "email": payload.get("email"),
                    "name": payload.get("name"),
                    "role": payload.get("role", "user"),
                    **payload,
                }
        except Exception:
            pass

    # 2. Stateless HS256 JWT Verification (Postman & local test persona tokens)
    try:
        payload = jwt.decode(
            token,
            BETTER_AUTH_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        if payload and (payload.get("sub") or payload.get("id") or payload.get("userId") or payload.get("user_id")):
            user_id = payload.get("sub") or payload.get("id") or payload.get("userId") or payload.get("user_id")
            return {
                "id": user_id,
                "email": payload.get("email", f"{user_id}@example.com"),
                "name": payload.get("name", "Test User"),
                "role": payload.get("role", "user"),
                **payload
            }
    except Exception:
        pass

    # 3. Session verification via Better Auth /api/auth/get-session
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{BETTER_AUTH_URL}/api/auth/get-session",
                headers=headers,
                timeout=5.0
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            data = response.json()
            if not data or "user" not in data or not data["user"] or not data["user"].get("id"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User record not found in database",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return data["user"]
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Authentication service unavailable: {str(exc)}",
            )

def require_roles(allowed_roles: list[str]):
    """FastAPI dependency enforcing role-based access after get_current_user succeeds."""
    async def _role_checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("role", "user")
        if allowed_roles and user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Insufficient role",
            )
        return current_user
    return _role_checker
`;
}

