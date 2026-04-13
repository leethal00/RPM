"use client"

import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LogIn } from "lucide-react"

interface SessionTimeoutDialogProps {
    open: boolean
}

export function SessionTimeoutDialog({ open }: SessionTimeoutDialogProps) {
    const router = useRouter()

    return (
        <Dialog open={open}>
            <DialogContent
                showCloseButton={false}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Session Expired</DialogTitle>
                    <DialogDescription>
                        Your session has expired. Please sign in again to continue.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={() => router.push("/login")}>
                        <LogIn className="mr-2 size-4" />
                        Sign In
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
