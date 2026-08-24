"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
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
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={`Connected to Xero — ${status.tenantName}`}>
                <span className="size-2 rounded-full bg-emerald-500" /> Xero: {status.tenantName}
            </span>
        )
    }
    return (
        <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
            <a href="/api/xero/connect">Connect Xero</a>
        </Button>
    )
}
