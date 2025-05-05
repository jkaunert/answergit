import { NextRequest, NextResponse } from 'next/server'
import { getRepositoryDocuments } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { maxResults } = await req.json()

    const documents = await getRepositoryDocuments(
      maxResults || 50
    )

    return NextResponse.json({
      success: true,
      documents
    })
  } catch (error) {
    console.error('Error fetching repository documents:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}