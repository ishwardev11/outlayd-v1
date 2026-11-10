"use client";

import React, { useState } from "react";
import { Check, CheckCircle2, ChevronDown, FileText, Sparkles } from "lucide-react";

export function InvoiceReviewMockup() {
    const [selectedFund, setSelectedFund] = useState("dana-pendidikan");
    const [selectedCategory, setSelectedCategory] = useState("utilities");
    const [isApproved, setIsApproved] = useState(false);

    return (
        <div className="w-full max-w-xl mx-auto rounded-2xl bg-[#14122E] border border-[#2D2A57] shadow-2xl shadow-black/40 overflow-hidden font-body text-left">
            {/* Window header */}
            <div className="bg-[#0F0D24] border-b border-[#2D2A57] px-4 sm:px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#E8A33D] inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#4F3BF5] inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0F9D8A] inline-block" />
                    <span className="text-xs font-semibold text-[#EEEBFF] ml-2 font-mono">
                        REVIEW: TNB-2026-0881
                    </span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#4F3BF5]/20 text-[#A599FF] border border-[#4F3BF5]/40 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                    <Sparkles className="w-3 h-3 text-[#A599FF]" />
                    <span>High confidence 95%</span>
                </div>
            </div>

            {/* Split Screen Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-12 min-h-[380px]">
                {/* Left: Original Receipt Preview */}
                <div className="sm:col-span-5 bg-[#0F0D24] border-b sm:border-b-0 sm:border-r border-[#2D2A57] p-4 flex flex-col justify-between">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#A5A0D0] mb-2 flex items-center justify-between">
                            <span>Original Receipt</span>
                            <span className="text-[10px] text-[#A5A0D0]/70 font-mono">JPG • 1.4 MB</span>
                        </div>

                        {/* Receipt ticket in dark paper style */}
                        <div className="bg-[#1A1738] border border-[#2D2A57] rounded-lg p-3 text-xs shadow-inner relative">
                            <div className="text-center pb-2 border-b border-dashed border-[#2D2A57]">
                                <div className="font-extrabold text-white text-[13px] tracking-tight">
                                    TENAGA NASIONAL BHD
                                </div>
                                <div className="text-[10px] text-[#A5A0D0]">Taman Harmoni Community Centre</div>
                                <div className="text-[10px] text-[#A5A0D0] font-mono mt-0.5">SST: W10-1808-32000018</div>
                            </div>

                            <div className="py-2.5 space-y-1.5 font-mono text-[11px]">
                                <div className="flex justify-between text-[#A5A0D0]">
                                    <span>Tarikh:</span>
                                    <span className="text-white">14/05/2026</span>
                                </div>
                                <div className="flex justify-between text-[#A5A0D0]">
                                    <span>No Akaun:</span>
                                    <span className="text-white">2201 9844 1102</span>
                                </div>
                                <div className="flex justify-between text-[#A5A0D0]">
                                    <span>Kegunaan:</span>
                                    <span className="text-white">320 kWh</span>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-[#4F3BF5]/40 flex justify-between items-baseline">
                                <span className="font-bold text-[#EEEBFF]">JUMLAH (RM)</span>
                                <span className="font-mono font-extrabold text-sm text-white">RM 184.60</span>
                            </div>

                            {/* Stamp overlay if approved */}
                            {isApproved && (
                                <div className="absolute inset-0 flex items-center justify-center bg-[#0F0D24]/85 backdrop-blur-[1px]">
                                    <div className="stamp-tag text-[#0F9D8A] border-[#0F9D8A] bg-[#0F9D8A]/15 px-3 py-1 rounded text-xs">
                                        APPROVED
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-3 text-[11px] text-[#A5A0D0] flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#4F3BF5]" />
                        <span>Matched with TNB billing schedule</span>
                    </div>
                </div>

                {/* Right: Extracted Fields & Approval */}
                <div className="sm:col-span-7 p-4 sm:p-5 flex flex-col justify-between bg-[#14122E]">
                    <div className="space-y-3.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#A5A0D0]">
                            Extracted Ledger Entry
                        </div>

                        {/* Vendor Name */}
                        <div>
                            <label className="text-[11px] font-semibold text-[#EEEBFF] block mb-1">
                                Vendor
                            </label>
                            <div className="w-full px-3 py-1.5 rounded-lg border border-[#2D2A57] bg-[#1A1738] text-xs font-semibold text-white flex items-center justify-between">
                                <span>Tenaga Nasional Berhad (TNB)</span>
                                <Check className="w-3.5 h-3.5 text-[#0F9D8A]" />
                            </div>
                        </div>

                        {/* Date and Amount Row */}
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <label className="text-[11px] font-semibold text-[#EEEBFF] block mb-1">
                                    Date
                                </label>
                                <div className="w-full px-3 py-1.5 rounded-lg border border-[#2D2A57] bg-[#1A1738] text-xs font-mono text-[#EEEBFF]">
                                    14/05/2026
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-[#EEEBFF] block mb-1">
                                    Total Amount
                                </label>
                                <div className="w-full px-3 py-1.5 rounded-lg border border-[#4F3BF5]/50 bg-[#4F3BF5]/15 text-xs font-mono font-bold text-[#A599FF]">
                                    RM 184.60
                                </div>
                            </div>
                        </div>

                        {/* Fund Allocation (Dropdown) */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px] font-semibold text-[#EEEBFF]">
                                    Restricted Fund Tag
                                </label>
                                <span className="text-[10px] text-[#E8A33D] font-bold bg-[#E8A33D]/15 border border-[#E8A33D]/30 px-1.5 py-0.2 rounded">
                                    Audit Critical
                                </span>
                            </div>
                            <div className="relative">
                                <select
                                    value={selectedFund}
                                    onChange={(e) => setSelectedFund(e.target.value)}
                                    className="w-full appearance-none px-3 py-1.5 rounded-lg border border-[#2D2A57] bg-[#1A1738] text-xs font-medium text-white focus:border-[#4F3BF5] focus:outline-none cursor-pointer"
                                >
                                    <option value="dana-pendidikan">Dana Pendidikan (Restricted)</option>
                                    <option value="dana-am">Dana Am (General)</option>
                                    <option value="geran-komuniti">Geran Komuniti 2026</option>
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-[#A5A0D0] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        {/* Category Dropdown */}
                        <div>
                            <label className="text-[11px] font-semibold text-[#EEEBFF] block mb-1">
                                Category
                            </label>
                            <div className="relative">
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="w-full appearance-none px-3 py-1.5 rounded-lg border border-[#2D2A57] bg-[#1A1738] text-xs font-medium text-white focus:border-[#4F3BF5] focus:outline-none cursor-pointer"
                                >
                                    <option value="utilities">Utilities &amp; Bills</option>
                                    <option value="events">Community Events &amp; Catering</option>
                                    <option value="office">Office &amp; Printing Supplies</option>
                                    <option value="transport">Transport &amp; Logistics</option>
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-[#A5A0D0] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-4 border-t border-[#2D2A57] mt-4 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setIsApproved(false)}
                            className="text-xs text-[#A5A0D0] hover:text-white font-medium px-2 py-1.5 cursor-pointer"
                        >
                            Skip
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsApproved(true)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                                isApproved
                                    ? "bg-[#0F9D8A] text-white"
                                    : "bg-[#4F3BF5] hover:bg-[#4330E0] text-white active:scale-95"
                            }`}
                        >
                            {isApproved ? (
                                <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Approved &amp; Synced!</span>
                                </>
                            ) : (
                                <>
                                    <span>Approve &amp; Next</span>
                                    <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">⌘↵</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
