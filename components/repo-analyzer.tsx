'use client'

import { useEffect, useState } from 'react'

interface RepoAnalyzerProps {
  username: string
  repo: string
}

export default function RepoAnalyzer({ username, repo }: RepoAnalyzerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [hasAttempted, setHasAttempted] = useState(false)

  useEffect(() => {
    const triggerAnalysis = async () => {
      if (isAnalyzing || hasAttempted) return
      
      try {
        setIsAnalyzing(true)
        const baseUrl = window.location.origin
        const analyzeResponse = await fetch(`${baseUrl}/api/analyze-repo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, repo })
        })

        const result = await analyzeResponse.json()
        
        if (!analyzeResponse.ok) {
          console.error('Failed to trigger repository analysis:', result.error)
        } else if (result.message === 'Repository has already been analyzed') {
          // If repository is already analyzed, just return early
          return
        }
      } catch (error) {
        console.error('Error triggering repository analysis:', error)
      } finally {
        setIsAnalyzing(false)
        setHasAttempted(true)
      }
    }

    triggerAnalysis()
  }, [username, repo, isAnalyzing, hasAttempted]) // Add hasAttempted to dependencies

  return null // This component doesn't render anything
}