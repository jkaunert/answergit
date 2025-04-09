import { NextRequest, NextResponse } from 'next/server'
import { searchSimilarDocuments } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { query, matchThreshold, maxResults } = await req.json()

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 }
      )
    }

    const documents = await searchSimilarDocuments(
      query,
      matchThreshold,
      maxResults
    )

    return NextResponse.json({
      success: true,
      documents
    })
  } catch (error) {
    console.error('Error searching similar documents:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}