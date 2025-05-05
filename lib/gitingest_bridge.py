#!/usr/bin/env python
"""
GitIngest Bridge Script

This script serves as a bridge between the Next.js application and the GitIngest Python package.
It accepts command line arguments for the repository owner and name, processes the repository
using GitIngest, and outputs the results in JSON format that can be consumed by the Next.js app.
It also provides detailed logging about the repository processing, including token counts and lines of code.
"""

import asyncio
import argparse
import json
import sys
from typing import Dict, Any

# Import the GitIngest service
try:
    from gitingest_service import get_repo_data
except ImportError:
    # If running from a different directory, adjust the import path
    import os
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from lib.gitingest_service import get_repo_data


async def main() -> None:
    """
    Main function to process command line arguments and run GitIngest.
    """
    parser = argparse.ArgumentParser(description="Process a GitHub repository using GitIngest")
    parser.add_argument("--username", "-u", required=True, help="GitHub repository owner")
    parser.add_argument("--repo", "-r", required=True, help="GitHub repository name")
    parser.add_argument("--force", "-f", action="store_true", help="Force refresh cache")
    
    args = parser.parse_args()
    
    try:
        # Process the repository
        result = await get_repo_data(args.username, args.repo, args.force)
        
        # Output the result as JSON
        print(json.dumps({
            "success": True,
            "data": result
        }))
        
    except ValueError as e:
        # Handle known error types
        error_message = str(e)
        print(json.dumps({
            "success": False,
            "error": error_message
        }))
        sys.exit(1)
    except Exception as e:
        # Handle unexpected errors
        print(json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())