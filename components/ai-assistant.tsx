"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SendHorizontal, Bot, User, Sparkles, FileQuestion, Code, Lightbulb, Package, Palette } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter'
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'


import { ThemeToggle } from "@/components/ui/theme-toggle"

interface AiAssistantProps {
  username: string
  repo: string
}

interface Message {
  role: "user" | "assistant"
  content: string
}

interface ApiResponse {
  success: boolean
  error?: string
  response?: string
}

interface QuickPromptButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

const QuickPromptButton = ({ icon, label, onClick }: QuickPromptButtonProps) => (
  <Button
    variant="outline"
    size="sm"
    className="flex items-center gap-1 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-xs whitespace-nowrap"
    onClick={onClick}
  >
    {icon}
    {label}
  </Button>
)

export default function AiAssistant({ username, repo }: AiAssistantProps) {
  const searchParams = useSearchParams()
  const filePath = searchParams.get("file")
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi! I'm your AI assistant for the ${username}/${repo} repository. Ask me anything about this codebase.`,
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentTypingIndex, setCurrentTypingIndex] = useState<number | null>(null)
  const [displayedContent, setDisplayedContent] = useState<string>('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingSpeed, setTypingSpeed] = useState(5) // Characters per 5ms
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, displayedContent])

  // Typing animation effect
  useEffect(() => {
    if (currentTypingIndex !== null && messages[currentTypingIndex]?.role === 'assistant') {
      const fullContent = messages[currentTypingIndex].content;
      
      if (displayedContent.length < fullContent.length) {
        setIsTyping(true);
        const timer = setTimeout(() => {
          setDisplayedContent(fullContent.substring(0, displayedContent.length + 1));
          // Scroll to bottom as content grows
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, typingSpeed);
        
        return () => clearTimeout(timer);
      } else {
        setIsTyping(false);
        setCurrentTypingIndex(null);
      }
    }
  }, [currentTypingIndex, displayedContent, messages, typingSpeed]);

  // Reset displayed content when new message arrives
  useEffect(() => {
    if (currentTypingIndex !== null && messages[currentTypingIndex]?.role === 'assistant') {
      setDisplayedContent('');
    }
  }, [currentTypingIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!input.trim() || isLoading) return

    const userMessage = { role: "user" as const, content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setDisplayedContent('')

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          repo,
          query: input,
          filePath,
          fetchOnlyCurrentFile: !!filePath
        })
      })

      const data = await response.json() as { success: boolean; summary?: string; error?: string; response?: string }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate response')
      }

      const newMessageIndex = messages.length
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }])
      setCurrentTypingIndex(newMessageIndex)
      
    } catch (error) {
      console.error("Error generating response:", error)
      const errorMessageIndex = messages.length
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error while processing your request. Please try again.",
        },
      ])
      setCurrentTypingIndex(errorMessageIndex)
      
    } finally {
      setIsLoading(false)
    }
  }

  const [theme, setTheme] = useState<'dark' | 'light' | 'dracula' | 'github'>('dark')
  
  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt)
  }
  
  const handleThemeChange = (newTheme: 'dark' | 'light' | 'dracula' | 'github') => {
    setTheme(newTheme)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center">
          <Sparkles className="h-4 w-4 mr-2 text-emerald-400" />
          <h2 className="font-medium text-sm">AI Assistant</h2>
        </div>
        <ThemeToggle />
      </div>

      <ScrollArea className="flex-1 p-4 overflow-y-auto" style={{ height: '100%' }}>
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg p-3 ${message.role === "user" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-200"}`}
                style={{ marginRight: message.role === "assistant" ? "2rem" : "0" }}
              >
                <div className="flex items-start gap-2">
                  {message.role === "assistant" ? (
                    <Bot className="h-4 w-4 mt-1 flex-shrink-0" />
                  ) : (
                    <User className="h-4 w-4 mt-1 flex-shrink-0" />
                  )}
                  <div className="text-sm prose prose-invert max-w-none break-words whitespace-pre-wrap" style={{ padding: '8px' }}>
                    {message.role === "assistant" && currentTypingIndex === index ? (
                      <>
                        <div className="prose prose-invert max-w-[85%] text-justify space-y-2 overflow-x-auto">
                          <ReactMarkdown
                            components={{
                              code({node, inline, className, children, ...props}: { node?: any; inline?: boolean; className?: string; children: React.ReactNode[]; }) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    {...props}
                                    style={dracula}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{
                                      margin: '1em 0',
                                      padding: '1em',
                                      borderRadius: '0.5em',
                                      fontSize: '0.9em'
                                    }}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                )
                              },
                              img({node, src, alt, ...props}) {
                                if (!src) return null;
                                return (
                                  <div className="my-4 flex justify-center">
                                    <img
                                      src={src}
                                      alt={alt || ''}
                                      className="max-w-full h-auto rounded-lg shadow-lg"
                                      style={{ maxHeight: '500px' }}
                                      {...props}
                                    />
                                  </div>
                                );
                              },
                              a({node, href, children, ...props}) {
                                if (href?.endsWith('.pdf')) {
                                  return (
                                    <div className="my-4 flex justify-center">
                                      <iframe
                                        src={href}
                                        className="w-full h-[500px] rounded-lg shadow-lg"
                                        {...props}
                                      />
                                    </div>
                                  );
                                }
                                return (
                                  <a href={href} {...props} target="_blank" rel="noopener noreferrer">
                                    {children}
                                  </a>
                                );
                              },
                              pre({node, children, ...props}) {
                                return (
                                  <div className="overflow-x-auto max-w-full" {...props}>
                                    {children}
                                  </div>
                                );
                              }
                            }}
                          >
                            {displayedContent}
                          </ReactMarkdown>
                        </div>
                        {isTyping && <span className="inline-block w-1 h-4 bg-emerald-400 ml-1 animate-pulse"></span>}
                      </>
                    ) : (
                      <div className="prose prose-invert max-w-[85%] text-justify space-y-2 overflow-x-auto">
                        <ReactMarkdown
                          components={{
                            code({node, inline = false, className, children, ...props}: { node?: any; inline?: boolean; className?: string; children: React.ReactNode[]; }) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  {...(props as SyntaxHighlighterProps)}
                                  style={dracula}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{
                                    margin: '1em 0',
                                    padding: '1em',
                                    borderRadius: '0.5em',
                                    fontSize: '0.9em'
                                  }}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              )
                            },
                            pre({node, children, ...props}) {
                              return (
                                <pre className="overflow-x-auto max-w-full" {...props}>
                                  {children}
                                </pre>
                              );
                            }
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg p-3 bg-zinc-800 text-zinc-200">
                <div className="flex items-start gap-2">
                  <Bot className="h-4 w-4 mt-1" />
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 bg-zinc-500 rounded-full animate-bounce"></div>
                    <div
                      className="h-2 w-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="h-2 w-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-zinc-800">
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
          <QuickPromptButton
            icon={<FileQuestion className="h-3 w-3" />}
            label={filePath ? "Explain this file" : "Explain structure"}
            onClick={() => handleQuickPrompt(filePath ? `Explain file contents of : ${filePath}` : "Explain the project structure And what it does?")}
          />
          <QuickPromptButton
            icon={<Package className="h-3 w-3" />}
            label="Dependencies"
            onClick={() => handleQuickPrompt("What are the main dependencies of this project?")}
          />
          <QuickPromptButton
            icon={<Lightbulb className="h-3 w-3" />}
            label="Improvements"
            onClick={() => handleQuickPrompt("How can I improve this codebase?")}
          />
          <QuickPromptButton
            icon={<Code className="h-3 w-3" />}
            label="Generate tests"
            onClick={() => handleQuickPrompt("Generate a test for this code")}
          />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            placeholder="Ask about this repository..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 resize-none bg-zinc-800 border-zinc-700 focus-visible:ring-emerald-500 text-sm"
            rows={2}
            style={{ padding: '8px', textAlign: 'justify' }}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

