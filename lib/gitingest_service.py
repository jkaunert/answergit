import asyncio
import os
import json
import time
from typing import Dict, Tuple, Any, Optional

# Import gitingest for repository analysis
try:
    from gitingest import ingest_async
    import aiohttp
except ImportError:
    print("GitIngest package not installed. Please run 'pip install gitingest'")

# Cache configuration
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'cache')
CACHE_EXPIRATION = 6 * 60 * 60  # 6 hours in seconds

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)


async def check_repo_exists(repo_url: str) -> bool:
    """Check if a repository exists and is accessible."""
    api_url = repo_url.replace("github.com", "api.github.com/repos")
    async with aiohttp.ClientSession() as session:
        try:
            response = await session.get(api_url)
            return response.status == 200
        except Exception:
            return False


async def ingest_repo(repo_url: str) -> Tuple[str, str, str]:
    """
    Converts a github repository into LLM-friendly format.

    Args:
        repo_url: The URL of the repository to ingest.

    Returns:
        A tuple containing the summary, the folder structure, and the content of the files in LLM-friendly format.
    """
    # Check if repository exists and is accessible
    if not await check_repo_exists(repo_url):
        raise ValueError("error:repo_not_found")

    try:
        print(f"[GitIngest] Starting repository ingestion for {repo_url}")
        start_time = time.time()
        
        summary, tree, content = await ingest_async(
            repo_url, exclude_patterns={"tests/*", "docs/*"}
        )
        
        # Calculate and log metrics
        processing_time = time.time() - start_time
        tree_lines = len(tree.split('\n'))
        content_lines = len(content.split('\n'))
        content_chars = len(content)
        
        # Extract token count from summary
        token_count = "Unknown"
        if "Estimated tokens: " in summary:
            tokens_str = summary.split("Estimated tokens: ")[-1].strip()
            token_count = tokens_str
            
            # Check if token count exceeds limit
            if tokens_str.endswith("M"):
                raise ValueError("error:repo_too_large")
            elif tokens_str.endswith("K"):
                tokens = float(tokens_str[:-1])
                if tokens > 750:
                    raise ValueError("error:repo_too_large")
        
        # Log detailed metrics
        print(f"[GitIngest] Repository processing completed in {processing_time:.2f} seconds")
        print(f"[GitIngest] Metrics for {repo_url}:")
        print(f"[GitIngest] - Token count: {token_count}")
        print(f"[GitIngest] - Tree structure: {tree_lines} lines")
        print(f"[GitIngest] - Content: {content_chars} characters, {content_lines} lines")
        
        return summary, tree, content
    except Exception as e:
        if "Repository not found" in str(e) or "Not Found" in str(e):
            raise ValueError("error:repo_not_found")
        if "Bad credentials" in str(e) or "API rate limit exceeded" in str(e):
            raise ValueError("error:repo_private")
        raise


def get_cache_path(username: str, repo: str) -> str:
    """Generate a cache file path for a repository."""
    return os.path.join(CACHE_DIR, f"{username}_{repo}_gitingest.json")


def is_cache_valid(cache_path: str) -> bool:
    """Check if cache file exists and is not expired."""
    if not os.path.exists(cache_path):
        return False
    
    # Check if cache is expired
    cache_time = os.path.getmtime(cache_path)
    current_time = time.time()
    return (current_time - cache_time) < CACHE_EXPIRATION


def save_to_cache(username: str, repo: str, data: Dict[str, Any]) -> None:
    """Save repository data to cache."""
    cache_path = get_cache_path(username, repo)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(data, f)


def load_from_cache(username: str, repo: str) -> Optional[Dict[str, Any]]:
    """Load repository data from cache if valid."""
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
    """Get repository data from cache or fetch it using GitIngest."""
    # Check cache first unless force refresh is requested
    if not force_refresh:
        cached_data = load_from_cache(username, repo)
        if cached_data:
            return cached_data
    
    # Construct GitHub repository URL
    repo_url = f"https://github.com/{username}/{repo}"
    
    # Fetch repository data using GitIngest
    summary, tree, content = await ingest_repo(repo_url)
    
    # Prepare data for storage
    repo_data = {
        "summary": summary,
        "tree": tree,
        "content": content,
        "timestamp": time.time()
    }
    
    # Save to cache
    save_to_cache(username, repo, repo_data)
    
    return repo_data


# For testing purposes
if __name__ == "__main__":
    async def test():
        username = "cyclotruc"
        repo = "gitingest"
        data = await get_repo_data(username, repo)
        print(f"Summary length: {len(data['summary'])}")
        print(f"Tree length: {len(data['tree'])}")
        print(f"Content length: {len(data['content'])}")

    asyncio.run(test())