import { Suspense } from "react"
import FileExplorer from "@/components/file-explorer"
import AiAssistant from "@/components/ai-assistant"
import FileViewer from "@/components/file-viewer"
import { fetchRepoData } from "@/lib/github"
import { Skeleton } from "@/components/ui/skeleton"
import { Metadata } from "next"
import { notFound, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RepoPageProps {
  params: Promise<{
    username: string
    repo: string
  }>
}

export async function generateMetadata({ params }: RepoPageProps): Promise<Metadata> {
  const { username, repo } = await params
  return {
    title: `${username}/${repo} - AnswersForGit`,
    description: `AI-powered code exploration for ${username}/${repo}`,
  }
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { username, repo } = await params

  try {
    const repoData = await fetchRepoData(username, repo)

    return (
      <div className="flex h-screen bg-zinc-950 text-zinc-200 font-sans">
        <div className="flex w-full">
          {/* Left sidebar - File Explorer */}
          <div className="w-80 border-r border-zinc-800 flex flex-col h-screen">
            <Suspense
              fallback={
                <div className="p-4">
                  <Skeleton className="h-[500px] bg-zinc-800" />
                </div>
              }
            >
              <FileExplorer repoData={repoData} />
            </Suspense>
          </div>

          {/* Main content area - Split between file viewer and AI assistant */}
          <div className="flex-1 flex flex-col h-screen">
            <div className="flex-1 overflow-hidden flex h-full">
              {/* File viewer */}
              <div className="flex-1 overflow-auto border-r border-zinc-800 h-full">
                <Suspense
                  fallback={
                    <div className="p-4">
                      <Skeleton className="h-[500px] bg-zinc-800" />
                    </div>
                  }
                >
                  <FileViewer repoData={repoData} />
                </Suspense>
              </div>

              {/* AI Assistant */}
              <div className="w-1/2 flex flex-col h-full">
                <AiAssistant username={username} repo={repo} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    notFound()
  }
}

