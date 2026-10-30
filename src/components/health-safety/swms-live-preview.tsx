"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { SwmsPrintDocument, type RecordRow, type Attendee, type Attachment } from "./swms-print-document"

const PAGE_WIDTH = 1120
const frameHtml = '<!doctype html><html><head><meta charset="utf-8"><title>SWMS/TA preview</title><style>html,body{margin:0;padding:0;font-family:Arial,sans-serif}*{box-sizing:border-box}</style></head><body></body></html>'

export function SwmsLivePreview({ record, attendees, attachments }: { record: RecordRow; attendees: Attendee[]; attachments: Attachment[] }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  const [height, setHeight] = useState(2000)
  const [body, setBody] = useState<HTMLElement | null>(null)
  const [fitWidth, setFitWidth] = useState(true)
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth || 560)
    measure()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener("resize", measure)
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure) }
  }, [])
  useEffect(() => {
    if (!body) return
    const measure = () => setHeight(Math.max(500, Math.ceil(body.getBoundingClientRect().height)))
    measure()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(body)
    body.addEventListener("load", measure, true)
    return () => { observer?.disconnect(); body.removeEventListener("load", measure, true) }
  }, [body, record, attendees, attachments])
  const scale = fitWidth ? Math.min(1, width / PAGE_WIDTH) : 1
  return <aside aria-label="Live SWMS/TA preview" className="min-w-0 self-start rounded-lg border bg-muted/20 xl:sticky xl:top-4">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
      <div><h3 className="text-sm font-semibold">Live SWMS/TA preview</h3><p className="text-xs text-muted-foreground">Includes unsaved edits. Save your draft before printing.</p></div>
      <Button type="button" size="sm" variant="outline" aria-pressed={!fitWidth} onClick={() => setFitWidth(value => !value)}>{fitWidth ? "100%" : "Fit width"}</Button>
    </div>
    <div ref={viewport} className="max-h-[75vh] overflow-auto">
      <div style={{ width: PAGE_WIDTH * scale, height: height * scale }}>
        <iframe title="SWMS/TA document preview" srcDoc={frameHtml}
          onLoad={event => setBody(event.currentTarget.contentDocument?.body || null)}
          className="block border-0 bg-white" style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})`, transformOrigin: "top left" }} />
      </div>
    </div>
    {body && createPortal(<>
      <SwmsPrintDocument record={record} attendees={attendees} attachments={attachments} />
      <style>{`.print-root { min-height: 0; } .print-sheet { margin-bottom: 0; }`}</style>
    </>, body)}
  </aside>
}
