"use client"

import { useLayoutEffect, useRef, type ComponentProps } from "react"
import { Textarea } from "@/components/ui/textarea"

export function ExpandingTextarea(props: ComponentProps<typeof Textarea>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const fit = () => {
      element.style.height = "auto"
      element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`
    }
    fit()
    let width = element.getBoundingClientRect().width
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width
      if (width !== nextWidth) { width = nextWidth; fit() }
    })
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [props.value])
  return <Textarea {...props} ref={ref} className={`min-h-20 resize-y overflow-hidden ${props.className || ""}`} />
}
