'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email.trim()) {
            toast.error('Please enter your email address')
            return
        }

        setLoading(true)

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })

        setLoading(false)

        if (error) {
            toast.error('Error', { description: error.message })
        } else {
            setSent(true)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] relative overflow-hidden font-primary">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />

            <Card className="w-full max-w-md border-primary/20 bg-black/40 backdrop-blur-xl text-white shadow-2xl relative z-10">
                <CardHeader className="space-y-3 text-center pb-8 border-b border-white/5">
                    <div className="mx-auto flex aspect-square size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                        <Building2 className="size-8" />
                    </div>
                    <div className="space-y-1">
                        <CardTitle className="text-3xl font-bold tracking-tight">Reset Password</CardTitle>
                        <CardDescription className="text-gray-400">
                            {sent
                                ? 'Check your email for a reset link'
                                : 'Enter your email to receive a password reset link'}
                        </CardDescription>
                    </div>
                </CardHeader>

                {sent ? (
                    <CardContent className="pt-8 pb-4">
                        <div className="flex flex-col items-center gap-4 text-center">
                            <CheckCircle2 className="size-12 text-primary" />
                            <p className="text-sm text-gray-400">
                                If an account exists for <span className="text-white font-medium">{email}</span>, you will receive a password reset email shortly.
                            </p>
                        </div>
                    </CardContent>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-5 pt-8">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-gray-400">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="your@email.com"
                                        className="bg-white/5 border-white/10 pl-10 h-11 focus:border-primary/50 focus:ring-primary/20 transition-all"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="pb-4">
                            <Button
                                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg shadow-lg shadow-primary/20 transition-all"
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    'Send Reset Link'
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                )}

                <div className="px-6 pb-8">
                    <Link
                        href="/login"
                        className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
                    >
                        <ArrowLeft className="size-4" />
                        Back to login
                    </Link>
                </div>
            </Card>

            <div className="absolute bottom-6 text-gray-500 text-xs tracking-widest uppercase">
                &copy; 2026 Rodier Property Management
            </div>
        </div>
    )
}
