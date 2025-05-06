import aiohttp
from gitingest import ingest_async  # type: ignore
import json
import sys

async def check_repo_exists(repo_url: str) -> bool:
    api_url = repo_url.replace("github.com", "api.github.com/repos")
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(api_url) as response:
                return response.status == 200
        except Exception:
            return False

async def main():
    try:
        username = sys.argv[sys.argv.index('--username')+1]
        repo = sys.argv[sys.argv.index('--repo')+1]
        force = '--force' in sys.argv
        
        repo_url = f"https://github.com/{username}/{repo}"
        
        if not await check_repo_exists(repo_url):
            print(json.dumps({"success": False, "error": "error:repo_not_found"}))
            return
        
        try:
            summary, tree, content = await ingest_async(
                repo_url, 
                exclude_patterns={"tests/*", "docs/*"}
            )
            
            if "Estimated tokens: " in summary:
                tokens_str = summary.split("Estimated tokens: ")[-1].strip()
                if tokens_str.endswith("M") or (tokens_str.endswith("K") and float(tokens_str[:-1]) > 750):
                    print(json.dumps({"success": False, "error": "error:repo_too_large"}))
                    return
            
            print(json.dumps({
                "success": True,
                "data": {
                    "summary": summary,
                    "tree": tree,
                    "content": content
                }
            }))
        except Exception as e:
            error_msg = str(e)
            if "Repository not found" in error_msg or "Not Found" in error_msg:
                print(json.dumps({"success": False, "error": "error:repo_not_found"}))
            elif "Bad credentials" in error_msg or "API rate limit exceeded" in error_msg:
                print(json.dumps({"success": False, "error": "error:repo_private"}))
            else:
                print(json.dumps({"success": False, "error": f"processing_error: {error_msg}"}))
    
    except Exception as e:
        print(json.dumps({"success": False, "error": f"unexpected_error: {str(e)}"}))

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())