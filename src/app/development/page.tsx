"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Camera, ClipboardList, Lightbulb, Smartphone, Wrench } from "lucide-react"

const ideas = [
  {
    title: "Mobile site app",
    status: "Concept",
    icon: Smartphone,
    description: "A very simple mobile view for Rodier staff working on site, with only the functions they need in the field.",
    points: ["Find/open the current job", "Record time on site", "Add notes from the phone", "Keep the interface quick and simple"],
  },
  {
    title: "Site photos direct to RPM",
    status: "Concept",
    icon: Camera,
    description: "Take photos while completing work and have them load directly against the correct RPM job or site instead of being transferred later.",
    points: ["Take photos from the phone", "Attach automatically to the selected job/site", "Keep photos available for job records and future reference"],
  },
  {
    title: "Field job completion",
    status: "Idea",
    icon: ClipboardList,
    description: "Let staff update the important parts of a live job from site without giving them the full RPM administration interface.",
    points: ["Work completed / progress update", "Labour and travel time", "Materials or notes", "Photos and completion evidence"],
  },
  {
    title: "RPM development workflow",
    status: "In progress",
    icon: Wrench,
    description: "Use this page as the running list of RPM improvements and concepts so ideas can be captured first and developed progressively on stu-dev.",
    points: ["Capture new ideas here", "Review before implementation", "Build and test on stu-dev", "Move proven features into the main RPM workflow later"],
  },
]

export default function DevelopmentPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Lightbulb className="size-4" />RPM Development</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">RPM Development & App Ideas</h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">A working list of concepts and improvements for RPM. These are development ideas, not live features, unless marked otherwise.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {ideas.map((idea) => {
            const Icon = idea.icon
            return (
              <Card key={idea.title} className="h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3"><div className="rounded-lg bg-muted p-2"><Icon className="size-5" /></div><CardTitle className="text-lg">{idea.title}</CardTitle></div>
                    <Badge variant="secondary" className="shrink-0">{idea.status}</Badge>
                  </div>
                  <CardDescription className="pt-2 leading-relaxed">{idea.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {idea.points.map((point) => <li key={point} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" /><span>{point}</span></li>)}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
