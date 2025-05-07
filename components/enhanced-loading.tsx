"use client"

import { cn } from "@/lib/utils"

export function EnhancedLoading({ className, loadingText }: { className?: string; loadingText?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center space-y-6", className)}>
      <div className="relative">
        {/* Outer spinning ring */}
        <div className="h-20 w-20 rounded-full border-4 border-blue-500/20 animate-spin-slow"></div>
        
        {/* Middle spinning ring */}
        <div className="absolute top-0 left-0 h-20 w-20 rounded-full border-4 border-t-blue-500 border-r-transparent border-b-blue-500/50 border-l-transparent animate-spin"></div>
        
        {/* Inner spinning ring */}
        <div className="absolute top-2 left-2 h-16 w-16 rounded-full border-4 border-r-purple-500 border-l-purple-500/50 border-t-transparent border-b-transparent animate-spin-reverse"></div>
        
        {/* Center icon */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-blue-500">
          <svg
            className="h-8 w-8 animate-pulse"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>
      
      {/* Text with gradient effect */}
      <div className="text-xl font-medium bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent animate-pulse">
        {loadingText || "Analyzing Repository..."}
      </div>
      
      {/* Dots animation */}
      <div className="flex space-x-2">
        <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="h-2 w-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
    </div>
  )
}