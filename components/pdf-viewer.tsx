'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

interface PDFViewerProps {
  pdfData: string
}

export default function PDFViewer({ pdfData }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Validate and format PDF data
  const validateAndFormatPDFData = (data: string) => {
    try {
      if (!data) return null
      
      // If data is already a valid data URL or URL, return it directly
      if (data.startsWith('data:application/pdf;base64,') || data.startsWith('http')) {
        return data
      }

      // Remove any whitespace and line breaks
      const sanitizedData = data.trim().replace(/\s/g, '')
      
      // Validate base64 string
      const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
      if (!base64Regex.test(sanitizedData)) {
        throw new Error('Invalid base64 format')
      }

      // Try to decode the base64 string to verify it's valid
      try {
        atob(sanitizedData)
      } catch (e) {
        throw new Error('Invalid base64 encoding')
      }

      return `data:application/pdf;base64,${sanitizedData}`
    } catch (e) {
      console.error('Invalid PDF data:', e)
      setError(e instanceof Error ? e.message : 'Invalid PDF data format')
      return null
    }
  }

  const pdfUrl = validateAndFormatPDFData(pdfData)

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
  }

  if (error) {
    return (
      <div className="text-red-400 flex items-center justify-center h-full">
        {error}
      </div>
    )
  }

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Skeleton className="w-32 h-32 bg-zinc-800" />
      </div>
    )
  }

  return (
    <ScrollArea className="w-full h-full min-h-[600px]">
      <div className="flex flex-col items-center p-4">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => setError(error.message)}
          loading={(
            <div className="flex items-center justify-center w-full h-32">
              <Skeleton className="w-32 h-32 bg-zinc-800" />
            </div>
          )}
          error={(
            <div className="text-red-400 flex items-center justify-center h-32">
              Failed to load PDF
            </div>
          )}
        >
          {Array.from(new Array(numPages), (_, index) => (
            <Page
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              className="mb-4"
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          ))}
        </Document>
      </div>
    </ScrollArea>
  )
}