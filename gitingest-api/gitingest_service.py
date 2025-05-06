import asyncio
import os
import json
import time
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

# Import gitingest for repository analysis
try:
    from gitingest import ingest_async
    import aiohttp
except ImportError:
    print("GitIngest package not installed. Please run 'pip install gitingest'")

# Create FastAPI app
app = FastAPI()

# CORS middleware for frontend access (e.g., Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache configuration
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'cache')
CACHE_EXPIRATION = 6 * 60 * 60  # 6 hours

os.makedirs(CACHE_DIR, exist_ok=True)

# ============ GitIngest Helpers =============

async def check_repo_exists(repo_url: str) -> bool:
    api_url = repo_url.replace("github.com", "api.github.com/repos")
    async with aiohttp.ClientSession() as session:
        try:
            response = await session.get(api_url)
            return response.status == 200
        except Exception:
            return False

async def ingest_repo(repo_url: str) -> dict:
    if not await check_repo_exists(repo_url):
        raise ValueError("error:repo_not_found")

    try:
        print(f"[GitIngest] Starting repository ingestion for {repo_url}")
        start_time = time.time()

        summary, tree, content = await ingest_async(
            repo_url, exclude_patterns={"tests/*", "docs/*"}
        )

        # Token limit check
        token_count = "Unknown"
        if "Estimated tokens: " in summary:
            tokens_str = summary.split("Estimated tokens: ")[-1].strip()
            token_count = tokens_str
            if tokens_str.endswith("M") or (tokens_str.endswith("K") and float(tokens_str[:-1]) > 750):
                raise ValueError("error:repo_too_large")

        print(f"[GitIngest] Completed in {time.time() - start_time:.2f}s")
        return { "summary": summary, "tree": tree, "content": content }

    except Exception as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise ValueError("error:repo_not_found")
        if "bad credentials" in msg.lower() or "rate limit" in msg.lower():
            raise ValueError("error:repo_private")
        raise ValueError(f"processing_error: {msg}")

def get_cache_path(username: str, repo: str) -> str:
    return os.path.join(CACHE_DIR, f"{username}_{repo}_gitingest.json")

def is_cache_valid(cache_path: str) -> bool:
    return os.path.exists(cache_path) and (time.time() - os.path.getmtime(cache_path)) < CACHE_EXPIRATION

def save_to_cache(username: str, repo: str, data: Dict[str, Any]) -> None:
    with open(get_cache_path(username, repo), 'w', encoding='utf-8') as f:
        json.dump(data, f)

def load_from_cache(username: str, repo: str) -> Optional[Dict[str, Any]]:
    cache_path = get_cache_path(username, repo)
    if not is_cache_valid(cache_path):
        return None
    try:
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading cache: {e}")
        return None

async def get_repo_data(username: str, repo: str, force_refresh: bool = False) -> Dict[str, Any]:
    if not force_refresh:
        cached_data = load_from_cache(username, repo)
        if cached_data:
            return cached_data

    repo_url = f"https://github.com/{username}/{repo}"
    result = await ingest_repo(repo_url)

    repo_data = {
        "summary": result["summary"],
        "tree": result["tree"],
        "content": result["content"],
        "timestamp": time.time()
    }

    save_to_cache(username, repo, repo_data)
    return repo_data

# ============ API Route =============

@app.post("/api/analyze-repo")
async def analyze_repo(request: Request):
    body = await request.json()
    username = body.get("username")
    repo = body.get("repo")

    if not username or not repo:
        raise HTTPException(status_code=400, detail="Missing 'username' or 'repo'.")

    try:
        data = await get_repo_data(username, repo)
        return { "success": True, "data": data }
    except ValueError as e:
        return { "success": False, "error": str(e) }
    except Exception as e:
        return { "success": False, "error": f"unexpected_error: {str(e)}" }
