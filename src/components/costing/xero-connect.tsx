"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

type Status = { connected: boolean; configured?: boolean; tenantName?: string | null }

export function XeroConnect() {
    const [status, setStatus] = useState<Status | null>(null)

    function load() {
        fetch("/api/xero/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ connected: false }))
    }

    useEffect(() => { load() }, [])

    useEffect(() => {
        const p = new URLSearchParams(window.location.search).get("xero")
        if (!p) return
        if (p === "connected") toast.success("Connected to Xero")
        else if (p === "denied") toast.error("Xero connection cancelled")
        else toast.error("Xero connection failed — check the developer app's redirect URI and credentials")
        window.history.replaceState({}, "", window.location.pathname)
        load()
    }, [])

    if (!status) return null
    if (status.connected) {
        return (
            <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={`Connected to Xero — ${status.tenantName}`}>
                    <span className="size-2 rounded-full bg-emerald-500" /> Xero: {status.tenantName}
                </span>
                <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" title="Reconnect Xero to refresh permissions">
                    <a href="/api/xero/connect"><RefreshCw className="size-3.5" /> Reconnect Xero</a>
                </Button>
            </div>
        )
    }
    return (
        <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
            <a href="/api/xero/connect">Connect Xero</a>
        </Button>
    )
}
