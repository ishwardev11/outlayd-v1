"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

function LoginForm() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const token_hash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        if (token_hash && type === "signup") {
            const verifyEmail = async () => {
                setIsLoading(true);
                setError(null);
                setSuccessMessage(null);
                const supabase = createClient();
                
                const { error: verifyError } = await supabase.auth.verifyOtp({
                    token_hash,
                    type: "signup",
                });

                if (verifyError) {
                    console.error("Error confirming email:", verifyError.message);
                    setError("Verification link expired or invalid.");
                } else {
                    setSuccessMessage("Email successfully confirmed! You can now log in.");
                    // Clear the query params from URL
                    router.replace("/login");
                }
                setIsLoading(false);
            };

            verifyEmail();
        }
    }, [searchParams, router]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        const formData = new FormData(e.currentTarget);
        const result = await signInAction(formData);

        if (result?.error) {
            setError(result.error);
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold text-white tracking-tight">Sign in to your account</h2>
                <p className="mt-2 text-sm text-slate-400">
                    Or{" "}
                    <Link href="/signup" id="signup-link" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                        create a new account
                    </Link>
                </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                    <div className="bg-red-950/40 border border-red-850 text-red-400 px-4 py-3 rounded-lg text-sm">
                        {error}
                    </div>
                )}
                {successMessage && (
                    <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-400 px-4 py-3 rounded-lg text-sm font-medium">
                        {successMessage}
                    </div>
                )}

                <div>
                    <label htmlFor="email-input" className="block text-sm font-medium text-slate-300">Email address</label>
                    <div className="mt-1">
                        <input
                            id="email-input"
                            name="email"
                            type="email"
                            required
                            placeholder="name@company.com"
                            className="appearance-none block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg shadow-sm placeholder-slate-500 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="password-input" className="block text-sm font-medium text-slate-300">Password</label>
                    <div className="mt-1">
                        <input
                            id="password-input"
                            name="password"
                            type="password"
                            required
                            placeholder="••••••••"
                            className="appearance-none block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg shadow-sm placeholder-slate-500 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm"
                        />
                    </div>
                </div>

                <div>
                    <Button
                        id="signin-btn"
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 cursor-pointer"
                    >
                        {isLoading ? "Processing..." : "Sign in"}
                    </Button>
                </div>
            </form>
        </>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="text-center py-8 text-slate-400 animate-pulse text-sm">
                Loading login page...
            </div>
        }>
            <LoginForm />
        </Suspense>
    );
}
