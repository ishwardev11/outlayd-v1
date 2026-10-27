"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, CreditCard, Loader2, Sparkles, ExternalLink } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { useRole } from "@/components/RoleProvider"

import { OrgSettings } from "./SettingsLayout"

export function BillingSettingsTab({ orgSettings }: { orgSettings: OrgSettings | null }) {
    const [isLoading, setIsLoading] = useState(false)
    const [isPortalLoading, setIsPortalLoading] = useState(false)
    const { isAdmin } = useRole()

    const isPro = orgSettings?.subscription_status === 'pro';

    const handleUpgrade = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Failed to create checkout session');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to start checkout process. Please try again.');
            setIsLoading(false);
        }
    };

    const handleManageSubscription = async () => {
        setIsPortalLoading(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            const orgId = user?.user_metadata?.organization_id || orgSettings?.id;

            const res = await fetch('/api/create-portal-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgId }),
            });
            const data = await res.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Failed to open billing portal');
            }
        } catch (error: unknown) {
            const err = error as Error;
            console.error('Portal error:', err);
            
            alert(err.message || 'Failed to open billing portal. Please try again.');
            if (err.message && err.message.toLowerCase().includes('reset')) {
                window.location.reload();
            }
            setIsPortalLoading(false);
        }
    };

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-500" />
                    Billing & Subscription
                </h2>
                <p className="text-slate-500 dark:text-slate-400">
                    Manage your plan, billing details, and view your current usage.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Current Plan Card */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Current Plan</p>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                                {isPro ? "Growth Tier" : "Free Tier"}
                            </h3>
                        </div>
                        {isPro && (
                            <div className="flex flex-col items-end gap-2">
                                {orgSettings?.cancel_at_period_end ? (
                                    <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                                        Cancels {orgSettings?.subscription_end_date ? new Date(orgSettings.subscription_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                    </span>
                                ) : (
                                    <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400">
                                        Active
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {!isPro ? (
                        <>
                            <p className="text-slate-600 dark:text-slate-300 mb-6">
                                You are currently on the free plan which includes up to 5 document extractions.
                            </p>
                            <Button 
                                onClick={handleUpgrade}
                                disabled={isLoading || !isAdmin}
                                title={!isAdmin ? "Only organization admins can upgrade the plan" : ""}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                                ) : (
                                    <><Sparkles className="w-4 h-4 mr-2" /> Upgrade to Growth - RM89/mo</>
                                )}
                            </Button>
                            {!isAdmin && (
                                <p className="text-xs text-center mt-3 text-slate-400">Only Admins can upgrade.</p>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-slate-600 dark:text-slate-300 mb-6">
                                You have unlimited access to all Growth features.
                            </p>
                            <Button
                                onClick={handleManageSubscription}
                                disabled={isPortalLoading || !isAdmin}
                                title={!isAdmin ? "Only organization admins can manage subscriptions" : ""}
                                variant="outline"
                                className="w-full border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300 disabled:opacity-50"
                            >
                                {isPortalLoading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirecting...</>
                                ) : (
                                    <><ExternalLink className="w-4 h-4 mr-2" />Manage Subscription</>
                                )}
                            </Button>
                            {!isAdmin && (
                                <p className="text-xs text-center mt-3 text-slate-400">Only Admins can manage billing.</p>
                            )}
                        </>
                    )}
                </div>

                {/* Features list when not Pro */}
                {!isPro && (
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 p-6 rounded-xl border border-indigo-100 dark:border-indigo-900">
                        <h3 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-4">
                            Growth Tier Includes:
                        </h3>
                        <ul className="space-y-3">
                            <li className="flex items-start">
                                <Check className="h-5 w-5 text-indigo-500 shrink-0 mr-2" />
                                <span className="text-sm text-indigo-900/80 dark:text-indigo-200">Unlimited AI receipt & invoice extraction</span>
                            </li>
                            <li className="flex items-start">
                                <Check className="h-5 w-5 text-indigo-500 shrink-0 mr-2" />
                                <span className="text-sm text-indigo-900/80 dark:text-indigo-200">Advanced board-ready PDF reporting</span>
                            </li>
                            <li className="flex items-start">
                                <Check className="h-5 w-5 text-indigo-500 shrink-0 mr-2" />
                                <span className="text-sm text-indigo-900/80 dark:text-indigo-200">Full procurement & quotation tracking</span>
                            </li>
                            <li className="flex items-start">
                                <Check className="h-5 w-5 text-indigo-500 shrink-0 mr-2" />
                                <span className="text-sm text-indigo-900/80 dark:text-indigo-200">Priority 24/7 support</span>
                            </li>
                        </ul>
                    </div>
                )}
            </div>
        </div>
    )
}
