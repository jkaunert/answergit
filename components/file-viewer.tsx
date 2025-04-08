"use client"

import { useSearchParams, usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"

interface FileViewerProps {
  repoData?: {
    files: {
      name: string
      path: string
      type: "file" | "directory"
      content?: string
      children?: any[]
    }[]
  }
}

export default function FileViewer({ repoData }: FileViewerProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const filePath = searchParams.get("file")
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pathParts = pathname.split("/")
  const username = pathParts[1]
  const repo = pathParts[2]

  useEffect(() => {
    if (!filePath) {
      setFileContent(null)
      setError(null)
      return
    }

    // Reset states
    setIsLoading(true)
    setError(null)

    // Find file content in the cached data first
    const findFileContent = (files: typeof repoData.files): string | null => {
      if (!files) return null
      
      for (const file of files) {
        if (file.path === filePath) {
          return file.content || null
        }
        if (file.children) {
          const content = findFileContent(file.children)
          if (content) return content
        }
      }
      return null
    }

    // Try to get content from cache first
    const cachedContent = repoData?.files ? findFileContent(repoData.files) : null
    
    if (cachedContent) {
      setFileContent(cachedContent)
      setIsLoading(false)
      return
    }

    // If not in cache, fetch from API
    const fetchFileContent = async () => {
      try {
        const response = await fetch(`/api/file-content?path=${encodeURIComponent(filePath)}&username=${encodeURIComponent(username)}&repo=${encodeURIComponent(repo)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch file content')
        }

        const content = await response.json()
        setFileContent(content)
      } catch (err) {
        console.error('Error fetching file content:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch file content')
      } finally {
        setIsLoading(false)
      }
    }

    fetchFileContent()
  }, [filePath, repoData?.files, pathname, username, repo])

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <p>Select a file to view its content</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="border-b bg-black p-2 px-4 text-sm font-mono text-zinc-400 rounded-t-lg">{filePath}</div>
        <div className="p-4">
          <Skeleton className="h-[20px] w-3/4 mb-2 bg-zinc-800" />
          <Skeleton className="h-[20px] w-1/2 mb-2 bg-zinc-800" />
          <Skeleton className="h-[20px] w-5/6 mb-2 bg-zinc-800" />
          <Skeleton className="h-[20px] w-2/3 mb-2 bg-zinc-800" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="border-b bg-black p-2 px-4 text-sm font-mono text-zinc-400 rounded-t-lg">{filePath}</div>
        <div className="flex-1 flex items-center justify-center text-red-400">
          <div className="text-center p-4">
            <p>Error loading file: {error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!fileContent) {
    return (
      <div className="p-4">
        <div className="border-b bg-black p-2 px-4 text-sm font-mono text-zinc-400 rounded-t-lg">{filePath}</div>
        <div className="p-4">
          <Skeleton className="h-[20px] w-3/4 mb-2 bg-zinc-800" />
          <Skeleton className="h-[20px] w-1/2 mb-2 bg-zinc-800" />
          <Skeleton className="h-[20px] w-5/6 mb-2 bg-zinc-800" />
          <Skeleton className="h-[20px] w-2/3 mb-2 bg-zinc-800" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      <div className="border-b bg-black p-2 px-4 text-sm font-mono text-zinc-400 rounded-t-lg">{filePath}</div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          <pre className="text-sm font-mono whitespace-pre-wrap">
            <code>{fileContent}</code>
          </pre>
        </div>
      </ScrollArea>
    </div>
  )
}

