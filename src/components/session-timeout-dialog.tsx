'use client'

import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LogIn } from 'lucide-react'

interface SessionTimeoutDialogProps {
    open: boolean
}

export function SessionTimeoutDialog({ open }: SessionTimeoutDialogProps) {
    const router = useRouter()

    return (
        <Dialog open={open} modal>
            <DialogContent
                showCloseButton={false}
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Session Expired</DialogTitle>
                    <DialogDescription>
                        Your session has expired. Please sign in again to continue.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={() => router.push('/login')}>
                        <LogIn className="mr-2 size-4" />
                        Sign In
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
