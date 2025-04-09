'use client'

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import ReactMarkdown from 'react-markdown'

interface NotebookViewerProps {
  notebookData: string
}

interface NotebookCell {
  cell_type: 'code' | 'markdown'
  source: string[]
  outputs?: Array<{
    output_type: string
    text?: string[]
    data?: {
      'text/plain'?: string[]
      'text/html'?: string[]
    }
  }>
}

interface IPythonNotebook {
  cells: NotebookCell[]
  metadata: any
  nbformat: number
  nbformat_minor: number
}

export default function NotebookViewer({ notebookData }: NotebookViewerProps) {
  const [error, setError] = useState<string | null>(null)
  const [notebook, setNotebook] = useState<IPythonNotebook | null>(null)

  useEffect(() => {
    const parseNotebook = (data: string): IPythonNotebook | null => {
      try {
        // Initial data validation
        if (!data || typeof data !== 'string') {
          throw new Error('Invalid input: Notebook data must be a non-empty string')
        }

        // Log the first part of the data for debugging
        console.log('Notebook data preview:', data.slice(0, 200))

        let parsed;
        try {
          // First attempt to parse as-is
          const trimmedData = data.trim()
          if (!trimmedData.startsWith('{') || !trimmedData.endsWith('}')) {
            throw new Error('Invalid JSON structure: Must be a JSON object')
          }
          parsed = JSON.parse(trimmedData)
        } catch (initialError) {
          console.log('Initial parse failed, attempting data cleanup...')
          
          // Pre-process the data in chunks to handle large files
          const chunkSize = 100000; // Process 100KB at a time
          let sanitizedData = '';
          
          for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize)
              // Remove all control characters except newlines and carriage returns
              .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
              // Remove Unicode BOMs
              .replace(/[\ufeff\ufffe\ufff9-\uffff]/g, '')
              // Normalize line endings
              .replace(/\r\n|\r/g, '\n')
              // Handle escaped characters
              .replace(/\\u0000/g, '') // Remove null bytes
              .replace(/\\([^"\\])/g, '$1') // Unescape non-quote backslashes
              .replace(/\\\\(?=["\\])/g, '\\') // Fix double escaped quotes/backslashes
              // Handle potential JSON string issues
              .replace(/\\["]/g, '"') // Fix escaped quotes
              .replace(/[\u2018\u2019]/g, "'") // Replace smart quotes
              .replace(/[\u201C\u201D]/g, '"') // Replace smart double quotes
              // Fix common JSON syntax errors
              .replace(/,\s*([\]\}])/g, '$1') // Remove trailing commas
              .replace(/([\{\[,])\s*,/g, '$1') // Remove empty elements
              .replace(/,\s*,/g, ',') // Remove consecutive commas
              // Fix missing commas between elements
              .replace(/}\s*{/g, '},{') // Fix missing commas between objects
              .replace(/]\s*\[/g, '],[') // Fix missing commas between arrays
              .replace(/}\s*\[/g, '},[')
              .replace(/]\s*{/g, '],{')
              // Fix potential JSON syntax errors
              .replace(/(["\d\}\]])\s*(["\{\[])/g, '$1,$2') // Add missing commas between values
              
            sanitizedData += chunk;
          }
          
          try {
            // Try parsing with sanitized data
            parsed = JSON.parse(sanitizedData)
          } catch (parseError: unknown) {
            console.error('JSON parse error after sanitization:', parseError)
            // Try one more time with additional cleanup
            try {
              sanitizedData = sanitizedData
                .replace(/,\s*([\]\}])/g, '$1') // Remove trailing commas
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim()
              parsed = JSON.parse(sanitizedData)
            } catch (finalError: unknown) {
              console.error('Final parse attempt failed:', finalError)
              throw new Error(`Failed to parse notebook: ${finalError instanceof Error ? finalError.message : 'Unknown error'}. The file may be corrupted or contain invalid JSON.`)
            }
          }
        }

        // Validate required notebook properties
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid notebook format: Must be a JSON object')
        }

        if (!Array.isArray(parsed.cells)) {
          throw new Error('Invalid notebook format: Missing cells array')
        }

        if (!parsed.nbformat || typeof parsed.nbformat !== 'number') {
          throw new Error('Invalid notebook format: Missing or invalid nbformat')
        }

        // Validate cell structure
        for (const cell of parsed.cells) {
          if (!cell.cell_type || !Array.isArray(cell.source)) {
            throw new Error('Invalid cell format: Missing required properties')
          }
          if (!['code', 'markdown'].includes(cell.cell_type)) {
            throw new Error(`Invalid cell type: ${cell.cell_type}`)
          }
        }

        return parsed
      } catch (e) {
        console.error('Notebook parsing error:', e)
        setError(
          `Failed to parse notebook: ${e instanceof Error ? e.message : 'Invalid format'}. Please ensure the notebook file is valid.`
        )
        return null
      }
    }

    setNotebook(parseNotebook(notebookData))
  }, [notebookData])

  if (error) {
    return (
      <div className="text-red-400 flex items-center justify-center h-full">
        {error}
      </div>
    )
  }

  if (!notebook) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Skeleton className="w-32 h-32 bg-zinc-800" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex flex-col gap-4 p-4">
        {notebook.cells.map((cell, index) => (
          <Card key={index} className="p-4">
            {cell.cell_type === 'markdown' && (
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown>{cell.source.join('')}</ReactMarkdown>
              </div>
            )}
            {cell.cell_type === 'code' && (
              <div className="font-mono">
                <pre className="bg-zinc-900 p-2 rounded">
                  <code>{cell.source.join('')}</code>
                </pre>
                {cell.outputs?.map((output, outputIndex) => (
                  <div key={outputIndex} className="mt-2">
                    {output.text && (
                      <pre className="bg-zinc-800 p-2 rounded text-sm">
                        {output.text.join('')}
                      </pre>
                    )}
                    {output.data?.['text/html'] && (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: output.data['text/html'].join('')
                        }}
                        className="bg-zinc-800 p-2 rounded"
                      />
                    )}
                    {output.data?.['text/plain'] && (
                      <pre className="bg-zinc-800 p-2 rounded text-sm">
                        {output.data['text/plain'].join('')}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </ScrollArea>
  )
}