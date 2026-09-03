'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Lock, Loader2 } from 'lucide-react'

function validatePassword(password: string): string | null {
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
    if (!/[0-9]/.test(password)) return 'Password must contain a number'
    return null
}

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [sessionReady, setSessionReady] = useState(false)
    const [sessionError, setSessionError] = useState<string | null>(null)

    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()

    useEffect(() => {
        const exchangeRecoveryCode = async () => {
            const code = searchParams.get('code')

            if (!code) {
                setSessionError('Reset link is missing its recovery code.')
                return
            }

            const { error } = await supabase.auth.exchangeCodeForSession(code)

            if (error) {
                setSessionError(error.message)
                return
            }

            setSessionReady(true)
        }

        exchangeRecoveryCode()
    }, [searchParams, supabase.auth])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!sessionReady) {
            toast.error('Reset session is not ready yet')
            return
        }

        const validationError = validatePassword(password)
        if (validationError) {
            toast.error(validationError)
            return
        }

        if (password !== confirmPassword) {
            toast.error('Passwords do not match')
            return
        }

        setLoading(true)

        const { error } = await supabase.auth.updateUser({ password })

        setLoading(false)

        if (error) {
            toast.error('Error', { description: error.message })
        } else {
            toast.success('Password updated successfully!')
            router.push('/login')
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
                        <CardTitle className="text-3xl font-bold tracking-tight">New Password</CardTitle>
                        <CardDescription className="text-gray-400">
                            {sessionError
                                ? sessionError
                                : sessionReady
                                    ? 'Enter your new password below'
                                    : 'Preparing secure password reset...'}
                        </CardDescription>
                    </div>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-5 pt-8">
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                New Password
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Min 8 chars, mixed case + number"
                                    className="bg-white/5 border-white/10 pl-10 h-11 focus:border-primary/50 focus:ring-primary/20 transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={!sessionReady || !!sessionError}
                                    required
                                />
                            </div>

                            <ul className="text-xs text-gray-500 space-y-1 pl-1">
                                <li className={password.length >= 8 ? 'text-green-400' : ''}>
                                    At least 8 characters
                                </li>
                                <li className={/[a-z]/.test(password) && /[A-Z]/.test(password) ? 'text-green-400' : ''}>
                                    Mixed case (upper and lower)
                                </li>
                                <li className={/[0-9]/.test(password) ? 'text-green-400' : ''}>
                                    At least one number
                                </li>
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Confirm Password
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="Repeat your new password"
                                    className="bg-white/5 border-white/10 pl-10 h-11 focus:border-primary/50 focus:ring-primary/20 transition-all"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={!sessionReady || !!sessionError}
                                    required
                                />
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="pb-8">
                        <Button
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg shadow-lg shadow-primary/20 transition-all"
                            type="submit"
                            disabled={loading || !sessionReady || !!sessionError}
                        >
                            {loading || !sessionReady ? (
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            ) : (
                                'Update Password'
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            <div className="absolute bottom-6 text-gray-500 text-xs tracking-widest uppercase">
                &copy; 2026 Rodier Property Management
            </div>
        </div>
    )
}
