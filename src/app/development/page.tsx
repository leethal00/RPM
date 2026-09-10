"use client"

import { useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Camera, CheckCircle2, ClipboardList, Clock, ExternalLink, Lightbulb, Loader2, MessageSquare, Smartphone, Sparkles, Timer, Truck, User, Wrench, AlertCircle } from "lucide-react"
import Link from "next/link"

interface FeatureRequest {
  id: number
  title: string
  description: string
  state: string
  created_at: string
  updated_at: string
  closed_at: string | null
  user: { login: string; avatar_url: string }
  labels: Array<{ name: string; color: string }>
  html_url: string
  comments: number
  pull_request: boolean
}

const ideas = [
  {
    title: "Mobile staff app",
    status: "Concept",
    icon: Smartphone,
    description: "A very small, phone-first RPM interface for staff working away from the office, without exposing the full administration system.",
    points: ["See today's assigned jobs", "Open the current job quickly", "Simple large-button mobile layout", "Only show the field functions staff need"],
  },
  {
    title: "Photos direct to RPM",
    status: "Concept",
    icon: Camera,
    description: "Let staff take photos from site and have them attach directly to the correct RPM job or site instead of transferring them later.",
    points: ["Take before / progress / after photos", "Attach to the selected job automatically", "Keep site history against the property", "Make photos available back at the office immediately"],
  },
  {
    title: "Field job updates",
    status: "Concept",
    icon: ClipboardList,
    description: "Allow staff to update a live job from site and record what happened without needing the full RPM desktop interface.",
    points: ["Mark en route / on site / complete", "Record no access or other incomplete reasons", "Add notes and completion comments", "Move straight to the next job when required"],
  },
  {
    title: "Time, travel & labour logging",
    status: "Concept",
    icon: Timer,
    description: "Capture accurate labour and travel time from the phone so job actuals and payroll records do not depend on handwritten timesheets.",
    points: ["Record arrival and departure times", "Track travel separately from site labour", "Allocate time to the correct RPM job", "Feed actual labour into Est vs Actual"],
  },
  {
    title: "Materials used on site",
    status: "Concept",
    icon: Wrench,
    description: "Let field staff record materials or extras used during the job so actual job cost can be captured as work happens.",
    points: ["Add common materials quickly", "Add free-text extras when required", "Record quantity used", "Feed actual material cost into the live job"],
  },
  {
    title: "Daily field work list",
    status: "Concept",
    icon: Truck,
    description: "Give each staff member a simple view of the work allocated to them for the day, designed around moving from one site to the next.",
    points: ["Today's assigned jobs", "Site address and contact details", "Open map/navigation", "Clear completed / remaining work"],
  },
]

const STALE_CUTOFF_DAYS = 90

export default function DevelopmentPage() {
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all")
  const [showOlder, setShowOlder] = useState(false)
  const cutoff = useMemo(() => Date.now() - STALE_CUTOFF_DAYS * 24 * 60 * 60 * 1000, [])

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch("/api/github/issues")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to fetch development pipeline")
        setRequests(data.feature_requests || [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load development pipeline")
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const isStaleClosed = (r: FeatureRequest) => r.state === "closed" && r.closed_at != null && new Date(r.closed_at).getTime() < cutoff
  const filteredRequests = requests.filter(r => (filter === "all" || r.state === filter) && (showOlder || !isStaleClosed(r)))
  const hiddenStaleCount = requests.filter(r => (filter === "all" || r.state === filter) && isStaleClosed(r)).length
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-NZ", { year: "numeric", month: "short", day: "numeric" })

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Lightbulb className="size-4" />RPM Development</div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">RPM Development</h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">One place for early concepts, planned improvements and the live GitHub-backed development pipeline.</p>
          </div>
          <Button asChild size="sm" className="gap-1.5 self-start"><Link href="/feature-request"><Sparkles className="size-3.5" />Add development idea</Link></Button>
        </div>

        <section className="space-y-4">
          <div><h2 className="text-xl font-semibold">Concepts & ideas</h2><p className="text-sm text-muted-foreground">Ideas we have discussed but have not necessarily committed to building yet.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            {ideas.map((idea) => { const Icon = idea.icon; return <Card key={idea.title} className="h-full"><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-lg bg-muted p-2"><Icon className="size-5" /></div><CardTitle className="text-lg">{idea.title}</CardTitle></div><Badge variant="secondary" className="shrink-0">{idea.status}</Badge></div><CardDescription className="pt-2 leading-relaxed">{idea.description}</CardDescription></CardHeader><CardContent><ul className="space-y-2 text-sm">{idea.points.map(point => <li key={point} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" /><span>{point}</span></li>)}</ul></CardContent></Card> })}
          </div>
        </section>

        <section className="space-y-4 border-t pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-semibold">Development pipeline</h2><p className="text-sm text-muted-foreground">Features that have been raised formally and are tracked through GitHub.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All ({requests.length})</Button><Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>In progress ({requests.filter(r => r.state === "open").length})</Button><Button size="sm" variant={filter === "closed" ? "default" : "outline"} onClick={() => setFilter("closed")}>Completed ({requests.filter(r => r.state === "closed").length})</Button></div></div>

          {hiddenStaleCount > 0 && <button type="button" onClick={() => setShowOlder(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">{showOlder ? `Hide ${hiddenStaleCount} older completed items` : `Show ${hiddenStaleCount} older completed items`}</button>}
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Pipeline unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {isLoading ? <div className="flex justify-center py-10"><Loader2 className="size-7 animate-spin text-primary" /></div> : filteredRequests.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No development items match this filter.</CardContent></Card> : <div className="space-y-3">{filteredRequests.map(request => <Card key={request.id}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span>{request.state === "closed" ? <CheckCircle2 className="size-4 text-green-600" /> : <Clock className="size-4 text-blue-600" />}</span><CardTitle className="text-base">{request.title}</CardTitle></div><CardDescription className="mt-2 line-clamp-2">{request.description || "No description provided"}</CardDescription></div><Badge className={request.state === "closed" ? "bg-green-600" : "bg-blue-600"}>{request.state === "closed" ? "Completed" : "In progress"}</Badge></div></CardHeader><CardContent className="pt-0"><div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><User className="size-3.5" />{request.user.login}</span><span>{formatDate(request.created_at)}</span>{request.comments > 0 && <span className="flex items-center gap-1.5"><MessageSquare className="size-3.5" />{request.comments}</span>}<a href={request.html_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 hover:text-foreground">GitHub <ExternalLink className="size-3" /></a></div></CardContent></Card>)}</div>}
        </section>
      </div>
    </DashboardLayout>
  )
}
