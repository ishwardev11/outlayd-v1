"use client";

import { useState } from "react";
import { CheckCircle2, FileCheck, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal";

const FEATURES = [
    "A signed-off PDF per fund or grant, ready for your donor, board or auditor",
    "Spending by category, a numbered transaction schedule and award remaining",
    "Automatic checks for missing receipts, missing invoice numbers and spend outside the grant period",
];

export function DonorMemoLocked() {
    const [showPaywall, setShowPaywall] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Donor & Audit Memo</h1>
                <p className="text-gray-500 dark:text-slate-400 mt-2 text-lg">
                    Turn one fund&apos;s spending into a donor-ready report in a few clicks.
                </p>
            </div>

            <Card className="max-w-2xl dark:bg-slate-900 dark:border-slate-800">
                <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20 flex items-center justify-center">
                        <LockKeyhole className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">The Donor & Audit Memo is a Growth feature</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Upgrade to Growth (included on the Nonprofit plan) to generate memos for any fund.
                        </p>
                    </div>
                    <ul className="space-y-3 text-left w-full">
                        {FEATURES.map((f) => (
                            <li key={f} className="flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{f}</span>
                            </li>
                        ))}
                    </ul>
                    <Button onClick={() => setShowPaywall(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 w-full sm:w-auto">
                        <FileCheck className="h-4 w-4" />
                        Upgrade to unlock
                    </Button>
                </CardContent>
            </Card>

            <UpgradePaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} context="donor_memo" />
        </div>
    );
}
