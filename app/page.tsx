'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Github } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoadingAnimation } from "@/components/loading-animation"

export default function Home() {
  const router = useRouter()
  const [repoUrl, setRepoUrl] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const handleAnalyze = () => {
    // Extract username and repo from the URL
    const urlPattern = /(?:github\.com\/)([\w-]+)\/([\w-]+)/
    const match = repoUrl.match(urlPattern)

    if (match) {
      const [, username, repo] = match
      setIsAnalyzing(true)
      router.push(`/${username}/${repo}`)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="max-w-3xl w-full text-center space-y-8">
          {isAnalyzing ? (
            <LoadingAnimation />
          ) : (
            <>
              <h1 className="text-5xl font-bold tracking-tight">Understand GitHub repositories with AI</h1>
              <p className="text-xl text-slate-600 dark:text-slate-300">
                Replace "github" with "answersforgit" in any repository URL to analyze, understand, and improve any GitHub
                project with AI-powered insights.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto">
                <Input 
                  placeholder="github.com/username/repository" 
                  className="flex-1" 
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
                <Button className="gap-2" onClick={handleAnalyze}>
                  Analyze Repository <ArrowRight size={16} />
                </Button>
              </div>

              <div className="pt-4 text-sm text-slate-500 dark:text-slate-400">
                Example: github.com/JohnDoe/billingproject → answersforgit.com/JohnDoe/billingproject
              </div>
            </>
          )}
        </div>
      </main>

      {/* Features Section */}
      <section className="py-16 px-6 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-lg">
              <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                <Github className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Repository Analysis</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Our AI scans the entire repository structure, code, and documentation to build a comprehensive
                understanding.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-lg">
              <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-purple-600 dark:text-purple-400"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 16v-4"></path>
                  <path d="M12 8h.01"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Smart Insights</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Get detailed explanations about project structure, dependencies, and how different components interact.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-lg">
              <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-green-600 dark:text-green-400"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Code Navigation</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Easily navigate through the codebase with our interactive file explorer and get instant explanations.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

