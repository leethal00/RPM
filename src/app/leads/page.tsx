import { ClipboardList, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function LeadsPage() {
    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm text-muted-foreground">
                        Job & Project Management
                    </p>

                    <h1 className="text-3xl font-bold tracking-tight">
                        Leads & To Do
                    </h1>

                    <p className="mt-2 text-muted-foreground">
                        Capture incoming work, follow-ups and tasks before they
                        become quotes or jobs.
                    </p>
                </div>

                <Button disabled>
                    <Plus className="mr-2 size-4" />
                    Add item
                </Button>
            </div>

            <div className="rounded-lg border bg-card p-10 text-center">
                <ClipboardList className="mx-auto mb-4 size-10 text-muted-foreground" />

                <h2 className="text-lg font-semibold">
                    No leads or tasks yet
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                    Your incoming leads and to-do items will appear here.
                </p>
            </div>
        </div>
    )
}
