"use client"

import { FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SiteConstructionSetProps {
    storeId: string
}

export function SiteConstructionSet({
    storeId: _storeId,
}: SiteConstructionSetProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">
                        Construction Set
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Final construction drawing sheets relevant to this site.
                    </p>
                </div>

                <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled
                    title="Drawing uploads will be enabled once document storage is connected"
                >
                    <Plus className="size-3.5" />
                    Add Drawing
                </Button>
            </div>

            <div className="rounded-lg border border-dashed border-border/60 py-14 text-center">
                <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />

                <p className="text-sm font-medium">
                    No construction drawings uploaded yet
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                    Individual PDF drawing sheets will be listed here.
                </p>
            </div>
        </div>
    )
}
