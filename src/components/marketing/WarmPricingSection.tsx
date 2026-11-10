"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Globe, HeartHandshake } from "lucide-react";

export function WarmPricingSection() {
    const [currency, setCurrency] = useState<"MYR" | "SGD" | "USD">("MYR");

    const rates = {
        MYR: { symbol: "RM", starter: 0, growth: 89, ngo: 49 },
        SGD: { symbol: "S$", starter: 0, growth: 27, ngo: 15 },
        USD: { symbol: "$", starter: 0, growth: 20, ngo: 11 },
    };

    const current = rates[currency];

    return (
        <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 bg-[#0E0C22] border-t border-[#232047]">
            <div className="container mx-auto max-w-6xl">
                {/* Heading */}
                <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#4F3BF5]/15 border border-[#4F3BF5]/30 text-[#A599FF] text-xs font-bold uppercase tracking-wider mb-3">
                        <span>Transparent Month-to-Month</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold text-white tracking-tight mb-4">
                        Simple, honest pricing. No hidden fees.
                    </h2>
                    <p className="font-body text-[#A5A0D0] text-sm sm:text-base leading-relaxed mb-6">
                        Strictly month-to-month. No annual contracts, no cancellation fees, and dedicated subsidized pricing for registered charities and community NGOs.
                    </p>

                    {/* Currency toggle */}
                    <div className="inline-flex items-center gap-1 p-1 bg-[#14122E] border border-[#232047] rounded-full text-xs font-medium">
                        <span className="px-2.5 text-[#A5A0D0] flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-[#4F3BF5]" />
                            <span>Currency:</span>
                        </span>
                        {(["MYR", "SGD", "USD"] as const).map((curr) => (
                            <button
                                key={curr}
                                type="button"
                                onClick={() => setCurrency(curr)}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                    currency === curr
                                        ? "bg-[#4F3BF5] text-white shadow-xs"
                                        : "text-[#A5A0D0] hover:text-white"
                                }`}
                            >
                                {curr} ({rates[curr].symbol})
                            </button>
                        ))}
                    </div>
                </div>

                {/* 3 Pricing Columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto text-left">
                    {/* Tier 1: Starter */}
                    <div className="bg-[#14122E] border border-[#232047] rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xs">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-heading font-bold text-lg text-white">Starter</h3>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-[#A5A0D0] bg-[#1A1738] border border-[#2D2A57] px-2 py-0.5 rounded">
                                    Free Forever
                                </span>
                            </div>
                            <div className="mb-4">
                                <span className="font-heading font-extrabold text-4xl text-white">
                                    {current.symbol} <span className="font-mono">{current.starter}</span>
                                </span>
                                <span className="text-[#A5A0D0] text-sm font-body"> / month</span>
                            </div>
                            <p className="font-body text-xs text-[#A5A0D0] mb-6 pb-6 border-b border-[#232047] leading-relaxed">
                                Perfect for solo operators and newly formed associations getting started with digitized bookkeeping.
                            </p>
                            <ul className="space-y-3 mb-8 font-body text-xs sm:text-sm text-[#EEEBFF]">
                                {[
                                    "1 User Account",
                                    "5 AI Document Scans / Month",
                                    "Basic Grant & Fund Categorization",
                                    "Vendor Directory & Balance Overview",
                                    "CSV Ledger Export",
                                    "Community Support"
                                ].map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <Check className="w-4 h-4 text-[#0F9D8A] shrink-0 mt-0.5" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <Link
                            href="/signup"
                            id="pricing-starter-btn"
                            className="w-full py-3 px-4 rounded-xl border border-[#4F3BF5]/50 font-bold text-xs sm:text-sm text-center text-white hover:bg-[#4F3BF5]/15 transition-all cursor-pointer block"
                        >
                            Get Started Free
                        </Link>
                    </div>

                    {/* Tier 2: Nonprofit & NGO (Beachhead Tier - Highlighted with Amber) */}
                    <div className="bg-[#14122E] border-2 border-[#E8A33D] rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-lg relative scale-100 md:-translate-y-2">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#E8A33D] text-[#14122E] px-3 py-0.5 text-[11px] font-heading font-extrabold uppercase tracking-wider rounded-full shadow-xs flex items-center gap-1.5 whitespace-nowrap">
                            <HeartHandshake className="w-3.5 h-3.5" />
                            NGO Beachhead Tier
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-heading font-bold text-lg text-[#E8A33D]">Nonprofit &amp; NGO</h3>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-[#E8A33D] bg-[#E8A33D]/15 border border-[#E8A33D]/30 px-2 py-0.5 rounded">
                                    Subsidized
                                </span>
                            </div>
                            <div className="mb-4">
                                <span className="font-heading font-extrabold text-4xl sm:text-5xl text-white">
                                    {current.symbol} <span className="font-mono">{current.ngo}</span>
                                </span>
                                <span className="text-[#A5A0D0] text-sm font-body"> / month</span>
                                <div className="text-[11px] text-[#E8A33D] font-bold mt-1">
                                    Discounted rate for verified Malaysian charities &amp; NGOs
                                </div>
                            </div>
                            <p className="font-body text-xs text-[#A5A0D0] mb-6 pb-6 border-b border-[#232047] leading-relaxed">
                                Dedicated support and unrestricted grant allocation tools built specifically for volunteer committees and mission teams.
                            </p>
                            <ul className="space-y-3 mb-8 font-body text-xs sm:text-sm text-[#EEEBFF]">
                                {[
                                    "All Growth Tier Features Included",
                                    "Unlimited Grant & Restricted Fund Tracking",
                                    "1-Click Donor Audit Packages with Receipts",
                                    "Tax Receipt Reconciliation",
                                    "Direct Founder Onboarding Call",
                                    "Dedicated NGO Community Slack Channel"
                                ].map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <Check className="w-4 h-4 text-[#E8A33D] shrink-0 mt-0.5" />
                                        <span className="font-medium">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <Link
                            href="/contact?subject=Nonprofit%20Pricing%20Application"
                            id="pricing-nonprofit-btn"
                            className="w-full py-3 px-4 rounded-xl bg-[#E8A33D] hover:bg-[#D99530] font-bold text-xs sm:text-sm text-center text-[#14122E] transition-all cursor-pointer block shadow-xs"
                        >
                            Apply for Nonprofit Pricing
                        </Link>
                    </div>

                    {/* Tier 3: Growth (CTA in solid --brand) */}
                    <div className="bg-[#14122E] border border-[#232047] rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xs">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-heading font-bold text-lg text-white">Growth</h3>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-[#A599FF] bg-[#4F3BF5]/20 border border-[#4F3BF5]/30 px-2 py-0.5 rounded">
                                    For SMEs
                                </span>
                            </div>
                            <div className="mb-4">
                                <span className="font-heading font-extrabold text-4xl text-white">
                                    {current.symbol} <span className="font-mono">{current.growth}</span>
                                </span>
                                <span className="text-[#A5A0D0] text-sm font-body"> / month</span>
                                <div className="text-[11px] text-[#A5A0D0] mt-1 font-medium">
                                    Strictly month-to-month • Cancel anytime
                                </div>
                            </div>
                            <p className="font-body text-xs text-[#A5A0D0] mb-6 pb-6 border-b border-[#232047] leading-relaxed">
                                For growing businesses needing unlimited AI document extraction, multi-tier approvals, and automated financial reports.
                            </p>
                            <ul className="space-y-3 mb-8 font-body text-xs sm:text-sm text-[#EEEBFF]">
                                {[
                                    "Up to 5 Team Members",
                                    "Unlimited AI Document Scans",
                                    "Multi-Tier Approval Routing",
                                    "Slide-Out Fast Processing Drawer",
                                    "Duplicate Receipt & Fraud Guard",
                                    "Exportable Board-Ready PDF Packages",
                                    "Priority Email & WhatsApp Support"
                                ].map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <Check className="w-4 h-4 text-[#4F3BF5] shrink-0 mt-0.5" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <Link
                            href="/signup"
                            id="pricing-growth-btn"
                            className="w-full py-3 px-4 rounded-xl bg-[#4F3BF5] hover:bg-[#4330E0] font-bold text-xs sm:text-sm text-center text-white transition-all cursor-pointer block shadow-xs"
                        >
                            Start 14-Day Free Trial
                        </Link>
                    </div>
                </div>

                {/* Assurance footnote */}
                <div className="mt-12 text-center text-xs text-[#A5A0D0] font-body">
                    <span>All plans include 256-bit SSL encryption and automatic cloud backups. Need custom invoice processing volume? </span>
                    <Link href="/contact" className="text-[#A599FF] font-semibold underline">Contact our team</Link>.
                </div>
            </div>
        </section>
    );
}
