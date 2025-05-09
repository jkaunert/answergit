"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  SendHorizontal,
  Bot,
  User,
  Sparkles,
  FileQuestion,
  Code,
  Lightbulb,
  Package,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"
import ReactMarkdown from "react-markdown"

import { ThemeToggle } from "@/components/ui/theme-toggle"
import { GitHubRateLimit } from "@/components/ui/github-rate-limit"
import { useGithubStars } from "@/hooks/useGithubStars"

interface AiAssistantProps {
  username: string
  repo: string
}

interface Message {
  role: "user" | "assistant"
  content: string
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
  const filePath = searchParams?.get("file") || null
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi! I'm your AI assistant for the [${username}](https://github.com/${username})/[${repo}](https://github.com/${username}/${repo}) repository. Ask me anything about this codebase.`,
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentTypingIndex, setCurrentTypingIndex] = useState<number | null>(null)
  const [displayedContent, setDisplayedContent] = useState<string>("")
  const [isTyping, setIsTyping] = useState(false)
  const [typingSpeed] = useState(5)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { stars, loading: starsLoading, error: starsError } = useGithubStars(username, repo)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, displayedContent])

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus()
  }, [isLoading])

  useEffect(() => {
    if (currentTypingIndex !== null && messages[currentTypingIndex]?.role === "assistant") {
      const fullContent = messages[currentTypingIndex].content
      if (displayedContent.length < fullContent.length) {
        setIsTyping(true)
        const timer = setTimeout(() => {
          setDisplayedContent(fullContent.substring(0, displayedContent.length + 1))
        }, typingSpeed)
        return () => clearTimeout(timer)
      } else {
        setIsTyping(false)
        setCurrentTypingIndex(null)
      }
    }
  }, [currentTypingIndex, displayedContent, messages, typingSpeed])

  useEffect(() => {
    if (currentTypingIndex !== null && messages[currentTypingIndex]?.role === "assistant") {
      setDisplayedContent("")
    }
  }, [currentTypingIndex])

  useEffect(() => {
    if (starsError) console.error("Error fetching GitHub stars:", starsError)
  }, [starsError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    await sendMessage()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!input.trim() || isLoading) return
      sendMessage()
    }
  }

  const sendMessage = async () => {
    const userInput = input
    const userMessage = { role: "user" as const, content: userInput }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setDisplayedContent("")
<<<<<<< Updated upstream

=======
>>>>>>> Stashed changes
    try {
      const baseUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      const response = await fetch(`${baseUrl}/api/gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          repo,
          query: input,
          filePath,
          fetchOnlyCurrentFile:
            input.includes("Explain file contents of") || input.includes("Explain this file"),
        }),
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error || "Failed to generate response")

      const newMessageIndex = messages.length
      setMessages((prev) => [...prev, { role: "assistant", content: data.response || "No response received." }])
      setCurrentTypingIndex(newMessageIndex)
    } catch (error) {
      console.error("Error generating response:", error)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error while processing your request. Please try again.",
        },
      ])
      setCurrentTypingIndex(messages.length)
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickPrompt = (prompt: string) => setInput(prompt)

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-900 border-l border-zinc-800">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
<<<<<<< Updated upstream
        <div className="flex items-center">
          <Sparkles className="h-4 w-4 mr-2 text-emerald-400" />
          <h2 className="font-medium text-sm">AI Assistant</h2>
=======
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <h2 className="font-medium text-sm">AI Assistant</h2>
          {!starsLoading && !starsError && stars !== null && (
            <a
            href={`https://github.com/${username}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
          >
            <svg
              className="h-4 w-4 fill-current"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            <span className="text-yellow-400 text-base leading-none">★</span>
            <span>{stars}</span>
          </a>
          
          
          )}
>>>>>>> Stashed changes
        </div>
        <div className="flex items-center gap-2">
          <GitHubRateLimit />
          <ThemeToggle />
        </div>
      </div>
  
      <ScrollArea className="flex-1 min-h-0 p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-4`}>
              <div
                className={`max-w-[85%] rounded-lg p-3 ${message.role === "user" ? "bg-emerald-600 text-white shadow-md" : "bg-zinc-800 text-zinc-200"}`}
                style={{ marginRight: message.role === "assistant" ? "2rem" : "0", marginLeft: message.role === "user" ? "2rem" : "0" }}
              >
                <div className="flex items-start gap-2">
                  {message.role === "assistant" ? <Bot className="h-4 w-4 mt-1" /> : <User className="h-4 w-4 mt-1" />}
                  <div className="text-sm prose prose-invert max-w-none break-words whitespace-pre-wrap">
                    <ReactMarkdown
                      components={{
                        code({
                          node,
                          inline = false,
                          className,
                          children,
                          ...props
                        }: React.HTMLAttributes<HTMLElement> & {
                          node?: any
                          inline?: boolean
                          className?: string
                          children?: React.ReactNode
                        }) {
                          const match = /language-(\w+)/.exec(className || "")
                          return !inline && match ? (
                            <SyntaxHighlighter
                              {...(props as any)}
                              style={dracula}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{
                                margin: "1em 0",
                                padding: "1em",
                                borderRadius: "0.5em",
                                fontSize: "0.9em",
                              }}
                            >
                              {String(children).replace(/\n$/, "")}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          )
                        },
                        pre({ node, children, ...props }) {
                          return (
                            <pre className="overflow-x-auto max-w-full" {...props}>
                              {children}
                            </pre>
                          )
                        },
                        p({ node, children, ...props }) {
                          return (
                            <p className="mb-2" {...props}>
                              {children}
                            </p>
                          )
                        },
                        ul({ node, children, ...props }) {
                          return (
                            <ul className="my-2 pl-6" {...props}>
                              {children}
                            </ul>
                          )
                        },
                        ol({ node, children, ...props }) {
                          return (
                            <ol className="my-2 pl-6" {...props}>
                              {children}
                            </ol>
                          )
                        },
                        li({ node, children, ...props }) {
                          return (
                            <li className="mb-1" {...props}>
                              {children}
                            </li>
                          )
                        },
                      }}
                    >
                      {currentTypingIndex === index ? displayedContent : message.content}
                    </ReactMarkdown>
                    {isTyping && currentTypingIndex === index && (
                      <span className="inline-block w-1 h-4 bg-emerald-400 ml-1 animate-pulse"></span>
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
                    <div className="h-2 w-2 bg-zinc-500 rounded-full animate-bounce" />
                    <div
                      className="h-2 w-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <div
                      className="h-2 w-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    />
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
            onClick={() =>
              handleQuickPrompt(
                filePath
                  ? `Explain file contents of : ${filePath}`
                  : "Explain the project structure And what it does?"
              )
            }
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
            onKeyDown={handleKeyDown}
            className="flex-1 resize-none bg-zinc-800 border-zinc-700 focus-visible:ring-emerald-500 text-sm"
            rows={2}
            disabled={isLoading}
            ref={inputRef}
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
