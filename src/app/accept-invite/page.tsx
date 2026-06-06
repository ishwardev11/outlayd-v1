"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { acceptInvite } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Lock, User, CheckCircle2, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

export default function AcceptInvitePage() {
    const [fullName, setFullName] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isVerifyingUser, setIsVerifyingUser] = useState(true)
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [tokenHash, setTokenHash] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        let isMounted = true

        const searchParams = new URLSearchParams(window.location.search)
        let errorParam = searchParams.get("error")
        let errorDesc = searchParams.get("error_description")

        // Parse from hash if search parameters do not have the error
        if (!errorParam && typeof window !== "undefined" && window.location.hash) {
            const hash = window.location.hash.substring(1)
            const hashParams = new URLSearchParams(hash)
            errorParam = hashParams.get("error")
            errorDesc = hashParams.get("error_description")
        }

        if (errorParam || errorDesc) {
            setErrorMsg(errorDesc || errorParam || "An error occurred during verification.")
            setIsVerifyingUser(false)
            return
        }

        // Check if we have token_hash in search params (custom email template link)
        const tokenHashParam = searchParams.get("token_hash")
        const emailParam = searchParams.get("email")

        if (tokenHashParam) {
            setTokenHash(tokenHashParam)
            if (emailParam) {
                setUserEmail(emailParam)
            }
            setIsVerifyingUser(false)
            return
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!isMounted) return

                if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
                    if (session?.user) {
                        setUserEmail(session.user.email || null)
                        setIsVerifyingUser(false)
                    } else if (event === "INITIAL_SESSION" && !searchParams.get("code")) {
                        // If there is an access_token or error in the hash fragment,
                        // wait for Supabase client to parse it and trigger SIGNED_IN or error redirection
                        const hasHashToken = typeof window !== "undefined" && 
                            (window.location.hash.includes("access_token=") || window.location.hash.includes("error="));
                        
                        if (!hasHashToken) {
                            setErrorMsg("No active invitation session found. Please click the secure invitation link in your email.")
                            setIsVerifyingUser(false)
                        }
                    }
                }
            }
        )

        const code = searchParams.get("code")
        if (code) {
            supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
                if (!isMounted) return
                if (error) {
                    console.error("Error exchanging code for session:", error)
                    setErrorMsg("Failed to verify invitation token: " + error.message)
                    setIsVerifyingUser(false)
                }
                // Success is handled by onAuthStateChange SIGNED_IN event
            }).catch((err) => {
                if (!isMounted) return
                console.error("Exception exchanging code for session:", err)
                setErrorMsg("An error occurred during verification: " + err.message)
                setIsVerifyingUser(false)
            })
        }

        return () => {
            isMounted = false
            subscription.unsubscribe()
        }
    }, [supabase])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg(null)

        if (password.length < 6) {
            setErrorMsg("Password must be at least 6 characters long.")
            return
        }

        if (password !== confirmPassword) {
            setErrorMsg("Passwords do not match.")
            return
        }

        setIsLoading(true)
        try {
            // If we have a tokenHash, verify the OTP first to log the user in
            if (tokenHash) {
                const { error: verifyError } = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: "invite"
                })

                if (verifyError) {
                    setErrorMsg("Failed to verify invitation token: " + verifyError.message)
                    setIsLoading(false)
                    return
                }
            }

            const res = await acceptInvite(password, fullName)
            if (res.success) {
                toast.success("Welcome to the team!", {
                    description: "You have successfully joined the workspace."
                })
                setSuccess(true)
                setTimeout(() => {
                    router.push("/dashboard")
                }, 1500)
            } else {
                setErrorMsg(res.message || "Failed to accept invite.")
            }
        } catch (error: any) {
            console.error("Invite acceptance error:", error)
            setErrorMsg(error.message || "Something went wrong.")
        } finally {
            setIsLoading(false)
        }
    }

    if (isVerifyingUser) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-slate-400 text-sm font-medium">Verifying invitation link...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient background glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-md shadow-2xl flex flex-col gap-6">
                {success ? (
                    <div className="text-center py-8 space-y-4 animate-in fade-in duration-300">
                        <div className="mx-auto w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Welcome aboard!</h2>
                        <p className="text-slate-400 text-sm">Your account has been created. Redirecting to your workspace...</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-white tracking-tight">You&apos;ve been invited!</h1>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                You have been invited to collaborate on the team&apos;s Outlayd ledger. Complete your profile below to join.
                            </p>
                        </div>

                        {errorMsg && !userEmail ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-xl text-red-400 text-sm leading-relaxed flex items-start gap-3">
                                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-semibold text-white">Verification Failed</p>
                                        <p className="text-red-400/90">{errorMsg}</p>
                                    </div>
                                </div>

                                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 space-y-2 text-xs text-slate-400 leading-relaxed">
                                    <p className="font-semibold text-slate-300">Why did this happen?</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>The invitation link may have expired (links are valid for 24 hours).</li>
                                        <li>The link might have been scanned or clicked in the background by your email provider&apos;s link protection filter, which consumes the one-time token.</li>
                                    </ul>
                                    <p className="mt-2 text-amber-400/90 font-medium">
                                        Good news: You can still join by signing up manually with your invited email address! Our system will automatically link you to the workspace.
                                    </p>
                                </div>

                                <div className="space-y-2 pt-2">
                                    <Button
                                        onClick={() => router.push("/signup")}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center cursor-pointer"
                                    >
                                        Create Account / Sign Up
                                    </Button>

                                    <Button
                                        onClick={() => router.push("/login")}
                                        variant="outline"
                                        className="w-full bg-transparent border-slate-800 hover:bg-slate-800/50 text-slate-300 hover:text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center cursor-pointer"
                                    >
                                        Back to Sign In
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {errorMsg && (
                                    <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-xl text-red-400 text-sm leading-relaxed flex items-start gap-3">
                                        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                                        <span>{errorMsg}</span>
                                    </div>
                                )}

                                {userEmail && (
                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        {/* Read-Only Email Display */}
                                        <div className="space-y-1 bg-slate-950/50 p-4 rounded-xl border border-slate-850">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Your Email Address</span>
                                            <p className="text-white text-sm font-medium">{userEmail}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="fullName" className="text-slate-300 text-xs font-medium">Full Name</Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                                                <Input
                                                    id="fullName"
                                                    placeholder="Jane Doe"
                                                    className="pl-10 bg-slate-950/50 border-slate-850 text-white placeholder-slate-600 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus:border-indigo-500 text-sm"
                                                    value={fullName}
                                                    onChange={(e) => setFullName(e.target.value)}
                                                    required
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="password" className="text-slate-300 text-xs font-medium">Password</Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                                                <Input
                                                    id="password"
                                                    type="password"
                                                    placeholder="••••••••"
                                                    className="pl-10 bg-slate-950/50 border-slate-850 text-white placeholder-slate-600 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus:border-indigo-500 text-sm"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    required
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="confirmPassword" className="text-slate-300 text-xs font-medium">Confirm Password</Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                                                <Input
                                                    id="confirmPassword"
                                                    type="password"
                                                    placeholder="••••••••"
                                                    className="pl-10 bg-slate-950/50 border-slate-850 text-white placeholder-slate-600 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus:border-indigo-500 text-sm"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    required
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </div>

                                        <Button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-md active:scale-[0.98] mt-4 flex items-center justify-center cursor-pointer"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                    Joining workspace...
                                                </>
                                            ) : (
                                                "Join Workspace"
                                            )}
                                        </Button>
                                    </form>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
