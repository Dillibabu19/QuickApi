import socket
import ipaddress
from time import perf_counter
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from logger import logger

# Supported HTTP methods for the proxy
HTTPMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

# Headers that should not be forwarded by the proxy as they are handled per-connection
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    "accept-encoding",
}


class Header(BaseModel):
    """Represents a single HTTP header key-value pair."""
    key: str
    value: str


class ProxyRequest(BaseModel):
    """Request model for the proxy endpoint."""
    url: str
    method: HTTPMethod = "GET"
    headers: list[Header] = Field(default_factory=list)
    body: str | None = None


class ProxyResponse(BaseModel):
    """Response model returned by the proxy endpoint."""
    status: int
    elapsed_ms: int
    headers: dict[str, str]
    body: str


app = FastAPI(title="QuickApi Proxy")

# Enable CORS for local development frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Health check endpoint to verify backend status."""
    logger.info("Health check endpoint called")
    return {"status": "ok"}


@app.post("/api/proxy", response_model=ProxyResponse)
async def proxy_request(payload: ProxyRequest) -> ProxyResponse:
    """
    Main proxy endpoint.
    Forwards incoming requests to target URLs while enforcing security policies.
    """
    logger.info(f"Received proxy request for {payload.url} with method {payload.method}")
    
    # 1. URL Validation
    parsed_url = urlparse(payload.url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
        
    hostname = parsed_url.hostname or ""
    
    # 2. Security: SSRF Protection
    # Block immediate localhost variations
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        logger.warning(f"Blocked attempt to proxy to localhost: {payload.url}")
        raise HTTPException(status_code=400, detail="Proxying to local network is not allowed")
        
    # Block private/local network IP ranges (DNS resolution check)
    try:
        ip_str = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            logger.warning(f"Blocked attempt to proxy to private IP ({ip_str}): {payload.url}")
            raise HTTPException(status_code=400, detail="Proxying to local network is not allowed")
    except (socket.gaierror, ValueError):
        # If it doesn't resolve, let it pass and httpx will handle connection errors later
        pass

    # 3. Request Preparation
    # Filter out hop-by-hop headers to avoid protocol interference
    headers = {
        header.key: header.value
        for header in payload.headers
        if header.key and header.key.lower() not in HOP_BY_HOP_HEADERS
    }
    content = payload.body.encode("utf-8") if payload.body and payload.method != "GET" else None

    # 4. Request Execution
    start = perf_counter()
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            response = await client.request(
                payload.method,
                payload.url,
                headers=headers,
                content=content,
            )
        logger.info(f"Successfully proxied request to {payload.url} with status {response.status_code}")
    except httpx.RequestError as exc:
        logger.error(f"Error proxying request to {payload.url}: {exc}")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # 5. Response Processing
    elapsed_ms = int((perf_counter() - start) * 1000)
    
    # Filter response headers
    response_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
    }

    return ProxyResponse(
        status=response.status_code,
        elapsed_ms=elapsed_ms,
        headers=response_headers,
        # Ensure body is decoded as string, replacing invalid characters if binary
        body=response.content.decode("utf-8", errors="replace"),
    )
