"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error("Error:", error)
  }, [error])

  return (
    <DashboardLayout>
      <div className="flex items-center justify-center p-12">
        <div className="mx-auto max-w-md text-center">
          <AlertTriangle className="mx-auto size-12 text-destructive" />
          <h2 className="mt-4 text-2xl font-bold">Something went wrong</h2>
          <p className="mt-2 text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              Go back
            </Button>
            <Button onClick={reset}>Try again</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
