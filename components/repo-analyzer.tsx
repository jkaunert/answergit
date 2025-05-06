'use client'

import { useEffect, useState } from 'react'

interface RepoAnalyzerProps {
  username: string
  repo: string
}

export default function RepoAnalyzer({ username, repo }: RepoAnalyzerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const triggerAnalysis = async () => {
      if (isAnalyzing) return
      
      try {
        setIsAnalyzing(true)
        setError(null)
        
        const baseUrl = window.location.origin
        
        // Analyze repository using GitIngest
        const analyzeResponse = await fetch(`${baseUrl}/api/analyze-repo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, repo })
        })

        const result = await analyzeResponse.json()
        
        if (!analyzeResponse.ok) {
          setError(result.error || 'Failed to analyze repository')
          console.error('Failed to analyze repository:', result.error)
        } else {
          setHasAnalyzed(true)
          console.log('Repository analysis completed successfully')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setError(errorMessage)
        console.error('Error analyzing repository:', errorMessage)
      } finally {
        setIsAnalyzing(false)
      }
    }

    if (!hasAnalyzed) {
      triggerAnalysis()
    }
  }, [username, repo, isAnalyzing, hasAnalyzed])

  // Reset states when username/repo changes
  useEffect(() => {
    setHasAnalyzed(false)
    setError(null)
  }, [username, repo])

  return null // This component doesn't render anything
}