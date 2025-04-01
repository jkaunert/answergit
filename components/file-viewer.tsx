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

  useEffect(() => {
    if (!filePath || !repoData?.files) {
      setFileContent(null)
      return
    }

    // Find file content in the cached data
    const findFileContent = (files: typeof repoData.files): string | null => {
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

    const content = findFileContent(repoData.files)
    setFileContent(content)
  }, [filePath, repoData?.files])

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <p>Select a file to view its content</p>
        </div>
      </div>
    )
  }

  if (!fileContent) {
    return (
      <div className="p-4">
        <Skeleton className="h-[20px] w-3/4 mb-2 bg-zinc-800" />
        <Skeleton className="h-[20px] w-1/2 mb-2 bg-zinc-800" />
        <Skeleton className="h-[20px] w-5/6 mb-2 bg-zinc-800" />
        <Skeleton className="h-[20px] w-2/3 mb-2 bg-zinc-800" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-zinc-800 p-2 px-4 text-sm font-mono text-zinc-400">{filePath}</div>
      <ScrollArea className="flex-1">
        <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
          <code>{fileContent}</code>
        </pre>
      </ScrollArea>
    </div>
  )
}

