from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from gitingest_service import get_repo_data
import json
import uvicorn
import os


app = FastAPI()

# Pydantic model for input validation
class RepoRequest(BaseModel):
    username: str
    repo: str
    force_refresh: bool = False


@app.get("/")
def read_root():
    return {"message": "GitIngest API is running!"}

@app.post("/api/analyze-repo")
async def analyze_repo(request: RepoRequest):
    """
    Analyzes a GitHub repository, either from cache or by fetching new data.
    """
    try:
        # Get repository data using the service
        repo_data = await get_repo_data(request.username, request.repo, request.force_refresh)
        
        # Prepare the response
        return {"success": True, "data": repo_data}
    except ValueError as e:
        # Handle known errors based on the logic in your services
        if str(e) == "error:repo_not_found":
            raise HTTPException(status_code=404, detail="Repository not found")
        elif str(e) == "error:repo_private":
            raise HTTPException(status_code=403, detail="Private repository or rate limit exceeded")
        elif str(e) == "error:repo_too_large":
            raise HTTPException(status_code=400, detail="Repository is too large to process")
        else:
            raise HTTPException(status_code=500, detail="Internal server error")
    except Exception as e:
        # General exception handling
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/api/repo-data")
async def get_repo_data_from_cache(username: str, repo: str):
    """
    Retrieves repository data from the cache, if available and valid.
    """
    try:
        # Try to get cached data
        cached_data = load_from_cache(username, repo)
        if cached_data:
            return {"success": True, "data": cached_data}
        else:
            return {"success": False, "error": "Cache expired or data not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading cache: {str(e)}")


# Endpoint to check repository existence (optional but useful)
@app.get("/api/repo-exists")
async def check_repo_exists(username: str, repo: str):
    repo_url = f"https://github.com/{username}/{repo}"
    exists = await check_repo_exists(repo_url)
    return {"exists": exists}

# Running the app (for development purposes)
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))  # Default to 8000 for local dev
    uvicorn.run("gitingest_service:app", host="0.0.0.0", port=port)