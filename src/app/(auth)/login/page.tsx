"use client";

import { useState } from "react";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

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
                        {isLoading ? "Signing in..." : "Sign in"}
                    </Button>
                </div>
            </form>
        </>
    );
}
