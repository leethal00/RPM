"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ClipboardList, ExternalLink, Loader2, AlertCircle, Calendar, User, MessageSquare, Sparkles, CheckCircle2, Clock } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface FeatureRequest {
  id: number
  title: string
  description: string
  state: string
  created_at: string
  updated_at: string
  closed_at: string | null
  user: {
    login: string
    avatar_url: string
  }
  labels: Array<{
    name: string
    color: string
  }>
  html_url: string
  comments: number
  pull_request: boolean
}

export default function FeatureRequestsPage() {
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all")

  useEffect(() => {
    fetchFeatureRequests()
  }, [])

  const fetchFeatureRequests = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/github/issues")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch feature requests")
      }

      setRequests(data.feature_requests)
    } catch (err: any) {
      setError(err.message || "Failed to load feature requests")
    } finally {
      setIsLoading(false)
    }
  }

  const filteredRequests = requests.filter((request) => {
    if (filter === "all") return true
    return request.state === filter
  })

  const getStateIcon = (state: string) => {
    if (state === "closed") return <CheckCircle2 className="size-4 text-green-600" />
    return <Clock className="size-4 text-blue-600" />
  }

  const getStateBadge = (state: string) => {
    if (state === "closed") {
      return <Badge variant="default" className="bg-green-600">Completed</Badge>
    }
    return <Badge variant="default" className="bg-blue-600">In Progress</Badge>
  }

  const getPriorityBadge = (labels: Array<{ name: string; color: string }>) => {
    const priorityLabel = labels.find(l => l.name.startsWith("priority:"))
    if (!priorityLabel) return null

    const priority = priorityLabel.name.replace("priority: ", "")
    const colorMap: Record<string, string> = {
      low: "bg-blue-100 text-blue-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-red-100 text-red-800",
    }

    return (
      <Badge variant="outline" className={colorMap[priority] || ""}>
        {priority.toUpperCase()}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-NZ", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8 py-6 max-w-7xl mx-auto font-primary">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ClipboardList className="size-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Feature Requests</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Submitted Features</h1>
              <p className="text-muted-foreground text-sm">
                View and track all feature requests submitted to RPM
              </p>
            </div>
            <Button asChild>
              <Link href="/feature-request">
                <Sparkles className="mr-2 h-4 w-4" />
                New Feature Request
              </Link>
            </Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
            size="sm"
          >
            All ({requests.length})
          </Button>
          <Button
            variant={filter === "open" ? "default" : "outline"}
            onClick={() => setFilter("open")}
            size="sm"
          >
            In Progress ({requests.filter(r => r.state === "open").length})
          </Button>
          <Button
            variant={filter === "closed" ? "default" : "outline"}
            onClick={() => setFilter("closed")}
            size="sm"
          >
            Completed ({requests.filter(r => r.state === "closed").length})
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="size-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No feature requests found</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {filter === "all"
                  ? "No feature requests have been submitted yet."
                  : `No ${filter} feature requests.`}
              </p>
              <Button asChild>
                <Link href="/feature-request">Submit Your First Feature Request</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStateIcon(request.state)}
                        <CardTitle className="text-lg">{request.title}</CardTitle>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {request.description || "No description provided"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {getStateBadge(request.state)}
                      {getPriorityBadge(request.labels)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <User className="size-3.5" />
                      <span>{request.user.login}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      <span>Created {formatDate(request.created_at)}</span>
                    </div>
                    {request.comments > 0 && (
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="size-3.5" />
                        <span>{request.comments} comments</span>
                      </div>
                    )}
                    {request.closed_at && (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 className="size-3.5" />
                        <span>Completed {formatDate(request.closed_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" asChild>
                      <a href={request.html_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        View on GitHub
                      </a>
                    </Button>
                    {request.labels.some(l => l.name === "ai-feature") && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Sparkles className="size-3" />
                        AI Auto-Build
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
