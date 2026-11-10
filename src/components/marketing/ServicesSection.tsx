"use client";

import React from "react";
import { Check, CheckCircle2, ArrowRight, FileText } from "lucide-react";

export function ServicesSection() {
    return (
        <section id="services" className="py-20 sm:py-28 px-4 sm:px-6 bg-[#0E0C22] border-t border-[#232047]">
            <div className="container mx-auto max-w-6xl">
                {/* Section Header */}
                <div className="max-w-2xl mb-14 sm:mb-18 text-left">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#4F3BF5]/15 border border-[#4F3BF5]/30 text-[#A599FF] text-xs font-bold uppercase tracking-wider mb-3">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Core Capabilities</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold text-white tracking-tight mb-4">
                        A well-kept ledger, made friendly for non-accountants.
                    </h2>
                    <p className="text-base sm:text-lg font-body text-[#A5A0D0] leading-relaxed">
                        Say goodbye to shoeboxes of wrinkled receipts and midnight Excel panics. Outlayd keeps your NGO or shop audit-ready with zero accounting jargon.
                    </p>
                </div>

                {/* FEATURE 1: Hero Large Feature - AI Receipt Extraction Before/After */}
                <div className="mb-14 rounded-2xl bg-[#14122E] border border-[#232047] p-6 sm:p-10 shadow-sm">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                        <div className="lg:col-span-5 space-y-4 text-left">
                            <span className="stamp-tag text-[#A599FF] border-[#4F3BF5] bg-[#4F3BF5]/20 px-2.5 py-0.5 rounded text-[11px]">
                                FEATURE 01
                            </span>
                            <h3 className="text-2xl sm:text-3xl font-heading font-bold text-white">
                                From crumpled paper to an audit-ready ledger row in 2 seconds.
                            </h3>
                            <p className="font-body text-[#A5A0D0] text-sm sm:text-base leading-relaxed">
                                Upload photos directly from WhatsApp, mobile camera snaps, or emailed supplier PDFs. Outlayd reads Malaysian receipts (SST ID, dates, ringgit line items) and writes them straight to your ledger.
                            </p>
                            <ul className="space-y-2 pt-2 text-xs sm:text-sm text-[#EEEBFF] font-body">
                                <li className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-[#0F9D8A] shrink-0" />
                                    <span>Trained on Malaysian tax invoices, petrol chits &amp; hawker receipts</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-[#0F9D8A] shrink-0" />
                                    <span>Flags duplicate claims before payment</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-[#0F9D8A] shrink-0" />
                                    <span>Preserves original photo proof for auditor inspections</span>
                                </li>
                            </ul>
                        </div>

                        {/* Interactive Before & After Visual */}
                        <div className="lg:col-span-7 bg-[#0B091D] border border-[#232047] rounded-xl p-4 sm:p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-11 gap-4 items-center">
                                {/* Left: Raw Receipt Card */}
                                <div className="sm:col-span-5 bg-[#171536] border border-[#2D2A57] p-4 rounded-lg shadow-inner font-mono text-[11px]">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#E8A33D] bg-[#E8A33D]/15 inline-block px-1.5 py-0.5 rounded mb-2">
                                        Raw Receipt Photo
                                    </div>
                                    <div className="font-bold text-white text-xs">Syarikat Katering Sri Murni</div>
                                    <div className="text-[10px] text-[#A5A0D0] mb-2">No. 14, Jalan Harmoni 3, PJ</div>
                                    <div className="border-t border-dashed border-[#2D2A57] my-2" />
                                    <div className="flex justify-between text-[#A5A0D0]">
                                        <span>Jamuan AGM (60 pax)</span>
                                        <span className="text-white">RM 720.00</span>
                                    </div>
                                    <div className="flex justify-between text-[#A5A0D0]">
                                        <span>Sewa Meja &amp; Kerusi</span>
                                        <span className="text-white">RM 150.00</span>
                                    </div>
                                    <div className="border-t border-[#4F3BF5]/40 my-2" />
                                    <div className="flex justify-between font-bold text-white">
                                        <span>JUMLAH:</span>
                                        <span>RM 870.00</span>
                                    </div>
                                </div>

                                {/* Arrow Indicator */}
                                <div className="sm:col-span-1 flex justify-center py-2 sm:py-0">
                                    <div className="w-8 h-8 rounded-full bg-[#4F3BF5]/20 text-[#A599FF] flex items-center justify-center font-bold">
                                        <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>

                                {/* Right: Structured Ledger Row */}
                                <div className="sm:col-span-5 bg-[#171536] border border-[#4F3BF5]/40 rounded-lg p-4 shadow-sm text-left">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#0F9D8A] bg-[#0F9D8A]/15 inline-block px-1.5 py-0.5 rounded mb-2">
                                        Extracted Ledger Row
                                    </div>
                                    <div className="space-y-2 text-xs font-body">
                                        <div>
                                            <span className="text-[10px] text-[#A5A0D0] block">Vendor</span>
                                            <span className="font-bold text-white">Syarikat Katering Sri Murni</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <span className="text-[10px] text-[#A5A0D0] block">Tarikh</span>
                                                <span className="font-mono text-[#EEEBFF]">18/05/2026</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-[#A5A0D0] block">Amaun</span>
                                                <span className="font-mono font-bold text-[#A599FF]">RM 870.00</span>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-[#2D2A57] flex items-center justify-between">
                                            <span className="inline-block px-2 py-0.5 bg-[#E8A33D]/15 text-[#E8A33D] rounded text-[10px] font-bold">
                                                Dana Am
                                            </span>
                                            <span className="text-[10px] text-[#0F9D8A] font-semibold flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Audit Verified
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FEATURE 2: Fund Allocation & Spend-By-Fund Bar View */}
                <div className="mb-14 rounded-2xl bg-[#14122E] border border-[#4F3BF5]/30 p-6 sm:p-10 text-left">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        <div className="lg:col-span-6 space-y-4">
                            <span className="stamp-tag text-[#E8A33D] border-[#E8A33D] bg-[#E8A33D]/15 px-2.5 py-0.5 rounded text-[11px]">
                                FEATURE 02 • NGO SPECIAL
                            </span>
                            <h3 className="text-2xl sm:text-3xl font-heading font-bold text-white">
                                Restrict spend by donor fund. No messy Excel formulas.
                            </h3>
                            <p className="font-body text-[#A5A0D0] text-sm sm:text-base leading-relaxed">
                                Donors and trustees demand to know exactly how restricted grants were spent. Assign receipts to specific funds with one click and generate donor-ready statements instantly.
                            </p>
                            
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A1738] border border-[#2D2A57] text-xs font-semibold text-[#EEEBFF]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#4F3BF5]" />
                                    Dana Pendidikan (Restricted)
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A1738] border border-[#2D2A57] text-xs font-semibold text-[#EEEBFF]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#E8A33D]" />
                                    Geran Komuniti 2026
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A1738] border border-[#2D2A57] text-xs font-semibold text-[#EEEBFF]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#0F9D8A]" />
                                    Dana Am (General)
                                </span>
                            </div>
                        </div>

                        {/* Spend-By-Fund Visual Breakdown */}
                        <div className="lg:col-span-6 bg-[#0B091D] border border-[#232047] rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-[#232047]">
                                <span className="font-heading font-bold text-sm text-white">
                                    Spend Allocation by Fund (May 2026)
                                </span>
                                <span className="text-xs font-mono font-bold text-[#A599FF]">
                                    RM 12,450.00 Total
                                </span>
                            </div>

                            {/* Fund Bar 1 */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs font-body">
                                    <span className="font-semibold text-[#EEEBFF]">Dana Pendidikan</span>
                                    <span className="font-mono text-[#A5A0D0]">RM 6,200 / RM 10,000 (62%)</span>
                                </div>
                                <div className="w-full bg-[#14122E] h-2.5 rounded-full overflow-hidden border border-[#232047]">
                                    <div className="bg-[#4F3BF5] h-full rounded-full" style={{ width: "62%" }} />
                                </div>
                            </div>

                            {/* Fund Bar 2 */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs font-body">
                                    <span className="font-semibold text-[#EEEBFF]">Geran Komuniti 2026</span>
                                    <span className="font-mono text-[#A5A0D0]">RM 4,500 / RM 5,000 (90%)</span>
                                </div>
                                <div className="w-full bg-[#14122E] h-2.5 rounded-full overflow-hidden border border-[#232047]">
                                    <div className="bg-[#E8A33D] h-full rounded-full" style={{ width: "90%" }} />
                                </div>
                            </div>

                            {/* Fund Bar 3 */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs font-body">
                                    <span className="font-semibold text-[#EEEBFF]">Dana Am</span>
                                    <span className="font-mono text-[#A5A0D0]">RM 1,750 / Unlimited</span>
                                </div>
                                <div className="w-full bg-[#14122E] h-2.5 rounded-full overflow-hidden border border-[#232047]">
                                    <div className="bg-[#0F9D8A] h-full rounded-full" style={{ width: "35%" }} />
                                </div>
                            </div>

                            <div className="pt-2 text-[11px] text-[#A5A0D0] font-body flex items-center justify-between">
                                <span>34 receipts verified with attached SST proofs</span>
                                <span className="text-[#A599FF] font-semibold hover:underline cursor-pointer">
                                    Export Audit Package PDF →
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FEATURE 3 & 4: Two-Column Split (Approvals & Vendor Directory) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                    {/* Approvals Block */}
                    <div className="bg-[#14122E] border border-[#232047] rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="stamp-tag text-[#0F9D8A] border-[#0F9D8A] bg-[#0F9D8A]/15 px-2.5 py-0.5 rounded text-[11px]">
                                    APPROVED
                                </span>
                                <span className="text-xs font-mono text-[#A5A0D0]">Dual Sign-off</span>
                            </div>
                            <h4 className="text-xl font-heading font-bold text-white mb-2">
                                Treasurer &amp; Committee Approvals
                            </h4>
                            <p className="font-body text-[#A5A0D0] text-sm leading-relaxed mb-6">
                                Volunteers submit receipts on the go; committee treasurers review and approve with a single tap. Complete paper trail for the annual AGM.
                            </p>
                        </div>
                        <div className="p-3 bg-[#0B091D] rounded-xl border border-[#232047] flex items-center justify-between text-xs font-body">
                            <div>
                                <div className="font-semibold text-white">Dewan Serbaguna Rental</div>
                                <div className="text-[11px] text-[#A5A0D0]">Approved by Bendahari Kehormat</div>
                            </div>
                            <span className="font-mono font-bold text-[#0F9D8A]">RM 350.00</span>
                        </div>
                    </div>

                    {/* Malaysian Vendor Directory Block */}
                    <div className="bg-[#14122E] border border-[#232047] rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="stamp-tag text-[#A599FF] border-[#4F3BF5] bg-[#4F3BF5]/20 px-2.5 py-0.5 rounded text-[11px]">
                                    LOCAL DIRECTORY
                                </span>
                                <span className="text-xs font-mono text-[#A5A0D0]">SST Verified</span>
                            </div>
                            <h4 className="text-xl font-heading font-bold text-white mb-2">
                                Malaysian Vendor Directory
                            </h4>
                            <p className="font-body text-[#A5A0D0] text-sm leading-relaxed mb-6">
                                Track recurring bills from TNB, Air Selangor, Grab, and local suppliers. Never misplace an account number or SST registration.
                            </p>
                        </div>
                        <div className="space-y-1.5 font-body text-xs">
                            <div className="flex justify-between items-center p-2 rounded-lg bg-[#0B091D] border border-[#232047]">
                                <span className="font-semibold text-white">Kedai Buku Maju</span>
                                <span className="font-mono text-[#A5A0D0]">Stationery • RM 210.50</span>
                            </div>
                            <div className="flex justify-between items-center p-2 rounded-lg bg-[#0B091D] border border-[#232047]">
                                <span className="font-semibold text-white">Tenaga Nasional Berhad</span>
                                <span className="font-mono text-[#A5A0D0]">Utility • RM 184.60</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
