"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { 
  Map, 
  Building2, 
  ClipboardList, 
  Hammer, 
  BarChart3
} from "lucide-react"

export default function HelpPage() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Help & Support</h1>
          <p className="text-muted-foreground mt-2">
            Learn how to use the RPM platform to manage your sites, assets, and maintenance operations.
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 mb-8 h-auto">
            <TabsTrigger value="overview" className="py-2 px-1 text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="sites" className="py-2 px-1 text-xs sm:text-sm">Sites</TabsTrigger>
            <TabsTrigger value="assets" className="py-2 px-1 text-xs sm:text-sm">Assets</TabsTrigger>
            <TabsTrigger value="jobs" className="py-2 px-1 text-xs sm:text-sm">Jobs & Faults</TabsTrigger>
            <TabsTrigger value="maintenance" className="py-2 px-1 text-xs sm:text-sm">Maintenance</TabsTrigger>
            <TabsTrigger value="analysis" className="py-2 px-1 text-xs sm:text-sm">Analysis</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Map className="size-5" />
                  Platform Overview
                </CardTitle>
                <CardDescription>Understanding the core components of the RPM platform</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  RPM (Rodier Preventive Maintenance) is a comprehensive signage asset management platform. It allows you to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Track physical locations:</strong> View all your stores across different regions on an interactive map.</li>
                  <li><strong>Manage assets:</strong> Keep a detailed inventory of all signage (e.g., Digital Menu Boards, Pylon Signs) at every location.</li>
                  <li><strong>Report faults & schedule jobs:</strong> Create tickets when an asset breaks or requires a repair.</li>
                  <li><strong>Plan preventive maintenance:</strong> Automatically generate schedules for periodic asset servicing.</li>
                  <li><strong>Analyze data:</strong> View analytics on budget usage, job severity, and general asset health.</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sites">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-5" />
                  Sites & Locations
                </CardTitle>
                <CardDescription>Managing your physical store locations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  The <strong>Sites / List</strong> tab gives you a complete overview of all physical locations within the system. You can:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>View Store Details:</strong> Click on any store to view its installed assets, active jobs, and photo galleries.</li>
                  <li><strong>Filter by Region:</strong> Use the region filters to find stores in specific geographical areas.</li>
                  <li><strong>Track Store Status:</strong> See whether a store is currently active, inactive, or undergoing maintenance.</li>
                </ul>
                <Separator className="my-4" />
                <h3 className="text-lg font-medium">Map View</h3>
                <p>
                  The interactive map on the dashboard provides a high-level geographical view of all active locations, allowing quick navigation to individual store profiles.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assets">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hammer className="size-5" />
                  Asset Inventory
                </CardTitle>
                <CardDescription>Tracking and maintaining your physical signage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  Every store contains an inventory of physical assets. From the store detail page, you can access individual assets to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Log new assets:</strong> Record the installation date, type, dimensions, and custom notes.</li>
                  <li><strong>Upload photos:</strong> Keep visual records of an asset&apos;s condition over time.</li>
                  <li><strong>Track service dates:</strong> The system automatically flags when an asset is due for scheduled service based on its asset type.</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="size-5" />
                  Jobs & Fault Reporting
                </CardTitle>
                <CardDescription>Handling repairs, tickets, and projects</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  If an asset becomes faulty or damaged, you can quickly report the issue using the <strong>Report Fault</strong> button in the sidebar.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Fault vs. Maintenance:</strong> Faults are reactive repairs. Maintenance jobs are scheduled preventative tasks.</li>
                  <li><strong>Job Workflow:</strong> Jobs start as &quot;Open&quot;, move to &quot;In Progress&quot;, and end as &quot;Resolved&quot; or &quot;Closed&quot;.</li>
                  <li><strong>Assigning Vendors:</strong> Jobs can be assigned to external vendors to carry out the required repair work.</li>
                  <li><strong>Budget Tracking:</strong> Add estimated cost impacts to each job to monitor expenses at a site or project level.</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hammer className="size-5" />
                  Preventive Maintenance
                </CardTitle>
                <CardDescription>Scheduling recurring maintenance cycles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  The PM Scheduler helps you keep your assets in working order before faults occur.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Service Intervals:</strong> Each asset type defines a default service interval (e.g., 365 days).</li>
                  <li><strong>Maintenance Jobs:</strong> Based on the install date or last service date, RPM alerts you when the next service is due.</li>
                  <li><strong>PM Scheduler Tab:</strong> A unified calendar view to plan and dispatch upcoming scheduled maintenance jobs to technicians and vendors.</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="size-5" />
                  Data Analysis
                </CardTitle>
                <CardDescription>Monitoring platform metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  Use the <strong>Analysis</strong> section to get a bird&apos;s-eye view of your operations:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Job Statistics:</strong> Monitor the volume of faults reported versus scheduled maintenance.</li>
                  <li><strong>Severity Breakdown:</strong> Identify critical issues that need immediate attention.</li>
                  <li><strong>Vendor Performance:</strong> Track which vendors are handling the highest volume of tasks.</li>
                  <li><strong>Budget Insights:</strong> Keep track of expenditure across all reactive and preventive maintenance.</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
