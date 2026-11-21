"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal";

// The screen a free organisation sees in place of a Growth feature (same look as the Donor Memo one).
export function FeatureLocked({
    title,
    tagline,
    heading,
    features,
    context,
    icon,
}: {
    title: string;
    tagline: string;
    heading: string;
    features: string[];
    context: "accounting_export" | "bank_statements" | "financial_statements";
    icon: ReactNode;
}) {
    const [showPaywall, setShowPaywall] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h1>
                <p className="text-gray-500 dark:text-slate-400 mt-2 text-lg">{tagline}</p>
            </div>

            <Card className="max-w-2xl dark:bg-slate-900 dark:border-slate-800">
                <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20 flex items-center justify-center">
                        <LockKeyhole className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{heading}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Upgrade to Growth (included on the Nonprofit plan) to unlock it.
                        </p>
                    </div>
                    <ul className="space-y-3 text-left w-full">
                        {features.map((f) => (
                            <li key={f} className="flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{f}</span>
                            </li>
                        ))}
                    </ul>
                    <Button onClick={() => setShowPaywall(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 w-full sm:w-auto">
                        {icon}
                        Upgrade to unlock
                    </Button>
                </CardContent>
            </Card>

            <UpgradePaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} context={context} />
        </div>
    );
}
