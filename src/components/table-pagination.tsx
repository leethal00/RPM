"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

interface TablePaginationProps {
    page: number
    pageCount: number
    onPageChange: (page: number) => void
    totalItems?: number
    pageSize?: number
}

export function TablePagination({ page, pageCount, onPageChange, totalItems, pageSize = 20 }: TablePaginationProps) {
    if (pageCount <= 1) return null

    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, totalItems ?? page * pageSize)

    return (
        <div className="flex items-center justify-between px-4 py-3 border-t">
            {totalItems !== undefined ? (
                <span className="text-sm text-muted-foreground">
                    {from}–{to} of {totalItems}
                </span>
            ) : (
                <span />
            )}
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onPageChange(1)}
                    disabled={page <= 1}
                >
                    <ChevronsLeft />
                </Button>
                <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                >
                    <ChevronLeft />
                </Button>
                <span className="text-xs font-medium px-2 text-muted-foreground">
                    Page {page} of {pageCount}
                </span>
                <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= pageCount}
                >
                    <ChevronRight />
                </Button>
                <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onPageChange(pageCount)}
                    disabled={page >= pageCount}
                >
                    <ChevronsRight />
                </Button>
            </div>
        </div>
    )
}
