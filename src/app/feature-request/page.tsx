"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Lightbulb, Loader2, CheckCircle2, AlertCircle, Sparkles, FileText } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { createClient } from "@/lib/supabase/client"

export default function FeatureRequestPage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")
  const [aiAutoBuild, setAiAutoBuild] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [developerMode, setDeveloperMode] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null
    message: string
    issueUrl?: string
  }>({ type: null, message: "" })

  useEffect(() => {
    const supabase = createClient()
    async function checkDeveloperMode() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from("users")
        .select("developer_mode")
        .eq("id", user.id)
        .single()
      setDeveloperMode(Boolean(profile?.developer_mode))
    }
    checkDeveloperMode()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus({ type: null, message: "" })

    try {
      const response = await fetch("/api/github/create-issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          priority,
          // Defence-in-depth: even if a non-dev somehow toggled this on,
          // never send true unless we know the caller is in developer mode.
          aiAutoBuild: developerMode && aiAutoBuild,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create feature request")
      }

      setSubmitStatus({
        type: "success",
        message: "Feature request submitted successfully!",
        issueUrl: data.html_url,
      })

      // Reset form
      setTitle("")
      setDescription("")
      setPriority("medium")
      setAiAutoBuild(false)
    } catch (error: unknown) {
      setSubmitStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to submit feature request. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const priorityColors = {
    low: "bg-blue-100 text-blue-800 border-blue-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    high: "bg-red-100 text-red-800 border-red-300",
  }

  return (
    <DashboardLayout>
      <PageShell width="narrow">
        <PageHeader
          icon={Lightbulb}
          title="Suggest a feature"
          description={developerMode
            ? "Submit a tracking ticket, or enable AI Auto-Build to ship it directly."
            : "Have an idea to improve RPM? Submit it as a tracking ticket and the team will pick it up."
          }
        />

        {submitStatus.type === "success" && (
          <Alert className="border-green-300 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Success!</AlertTitle>
            <AlertDescription className="text-green-700">
              {submitStatus.message}
              {submitStatus.issueUrl && (
                <a
                  href={submitStatus.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-2 underline font-semibold hover:text-green-900"
                >
                  View your feature request on GitHub →
                </a>
              )}
            </AlertDescription>
          </Alert>
        )}

        {submitStatus.type === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{submitStatus.message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Submit Feature Request</CardTitle>
            <CardDescription>
              Describe your feature idea clearly. Choose whether you want it tracked for manual development or built automatically by AI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Feature Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Add dark mode support"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="font-primary"
                />
                <p className="text-xs text-muted-foreground">
                  A clear, concise title for your feature request
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the feature in detail. What problem does it solve? How should it work?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  disabled={isSubmitting}
                  rows={8}
                  className="font-primary resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Provide as much detail as possible to help the AI understand your request
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority *</Label>
                <Select
                  value={priority}
                  onValueChange={(value: "low" | "medium" | "high") => setPriority(value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="priority" className="font-primary">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${priorityColors.low.split(" ")[0]}`} />
                        <span>Low - Nice to have</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${priorityColors.medium.split(" ")[0]}`} />
                        <span>Medium - Would improve workflow</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${priorityColors.high.split(" ")[0]}`} />
                        <span>High - Critical for workflow</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How important is this feature to your workflow?
                </p>
              </div>

              {developerMode && (
                <div className="space-y-3 p-4 bg-muted/40 rounded-md border border-border/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <Label htmlFor="ai-auto-build" className="text-sm font-medium cursor-pointer">
                        AI Auto-Build
                      </Label>
                    </div>
                    <Switch
                      id="ai-auto-build"
                      checked={aiAutoBuild}
                      onCheckedChange={setAiAutoBuild}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2 pl-6">
                    {aiAutoBuild ? (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">AI enabled</span> — submission triggers the automated workflow. Claude reads the requirements, implements, runs tests, and pushes to <code className="text-xs">dev</code> within minutes.
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Manual tracking</span> — a GitHub issue is created for the team to pick up.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting || !title.trim() || !description.trim()}
                  className="font-semibold"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="mr-2 h-4 w-4" />
                      Submit Feature Request
                    </>
                  )}
                </Button>
                {(title || description) && !isSubmitting && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTitle("")
                      setDescription("")
                      setPriority("medium")
                      setAiAutoBuild(false)
                      setSubmitStatus({ type: null, message: "" })
                    }}
                  >
                    Clear Form
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {developerMode && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {aiAutoBuild ? (
                  <>
                    <Sparkles className="size-4 text-primary" />
                    AI Auto-Build workflow
                  </>
                ) : (
                  <>
                    <FileText className="size-4 text-muted-foreground" />
                    Manual tracking workflow
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {aiAutoBuild ? (
                <>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-xs font-medium">1</div>
                    <div>
                      <p className="font-medium text-foreground">Submit</p>
                      <p className="text-muted-foreground">Fill out the form with your feature idea and priority level.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-xs font-medium">2</div>
                    <div>
                      <p className="font-medium text-foreground">AI implementation</p>
                      <p className="text-muted-foreground">Claude analyses your request, implements following best practices, and runs tests.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-xs font-medium">3</div>
                    <div>
                      <p className="font-medium text-foreground">Review</p>
                      <p className="text-muted-foreground">A pull request lands on dev for you to review, preview, and approve or request changes.</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center size-5 rounded-full bg-muted text-muted-foreground text-xs font-medium">1</div>
                    <div>
                      <p className="font-medium text-foreground">Submit</p>
                      <p className="text-muted-foreground">Fill out the form with your feature idea and priority level.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center size-5 rounded-full bg-muted text-muted-foreground text-xs font-medium">2</div>
                    <div>
                      <p className="font-medium text-foreground">Issue created</p>
                      <p className="text-muted-foreground">A GitHub issue is created on the repository for tracking and discussion.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center size-5 rounded-full bg-muted text-muted-foreground text-xs font-medium">3</div>
                    <div>
                      <p className="font-medium text-foreground">Manual development</p>
                      <p className="text-muted-foreground">The development team reviews and implements based on priority and roadmap.</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </PageShell>
    </DashboardLayout>
  )
}
