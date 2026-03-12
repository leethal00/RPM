"use client"

import { useState } from "react"
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

export default function FeatureRequestPage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")
  const [aiAutoBuild, setAiAutoBuild] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null
    message: string
    issueUrl?: string
  }>({ type: null, message: "" })

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
          aiAutoBuild,
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
    } catch (error: any) {
      setSubmitStatus({
        type: "error",
        message: error.message || "Failed to submit feature request. Please try again.",
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
      <div className="flex flex-col gap-8 py-6 max-w-4xl mx-auto font-primary">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Lightbulb className="size-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Feature Request</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Request a New Feature</h1>
          <p className="text-muted-foreground text-sm">
            Have an idea to improve RPM? Submit your feature request as a tracking ticket, or enable AI Auto-Build for automatic implementation.
          </p>
        </div>

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

              <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-5 text-primary" />
                    <Label htmlFor="ai-auto-build" className="text-base font-semibold cursor-pointer">
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
                <div className="space-y-2 pl-7">
                  {aiAutoBuild ? (
                    <div className="flex items-start gap-2">
                      <Sparkles className="size-4 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-foreground">
                        <span className="font-semibold text-primary">AI Enabled:</span> Your feature request will trigger an automated workflow. Claude will read your requirements, implement the feature following best practices, run tests, and create a pull request for your review within minutes.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <FileText className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">Manual Tracking:</span> Your feature request will be created as a GitHub issue for tracking and manual implementation by the development team.
                      </p>
                    </div>
                  )}
                </div>
              </div>

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

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {aiAutoBuild ? (
                <>
                  <Sparkles className="size-4 text-primary" />
                  AI Auto-Build Workflow
                </>
              ) : (
                <>
                  <FileText className="size-4" />
                  Manual Tracking Workflow
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiAutoBuild ? (
              <>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Submit Your Request</h4>
                    <p className="text-sm text-muted-foreground">
                      Fill out the form with your feature idea, priority level, and enable AI Auto-Build
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">AI Implementation</h4>
                    <p className="text-sm text-muted-foreground">
                      Claude analyzes your request, implements the feature following best practices, and runs tests
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Review & Approve</h4>
                    <p className="text-sm text-muted-foreground">
                      You receive a pull request to review, test in preview, and approve or request changes
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-muted-foreground text-muted text-xs font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Submit Your Request</h4>
                    <p className="text-sm text-muted-foreground">
                      Fill out the form with your feature idea and priority level
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-muted-foreground text-muted text-xs font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Issue Created</h4>
                    <p className="text-sm text-muted-foreground">
                      A GitHub issue is created on the repository for tracking and discussion
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-muted-foreground text-muted text-xs font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Manual Development</h4>
                    <p className="text-sm text-muted-foreground">
                      The development team reviews and implements the feature based on priority and roadmap
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
