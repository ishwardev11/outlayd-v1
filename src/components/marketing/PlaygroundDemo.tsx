"use client";

import React, { useState, useEffect } from "react";
import { Play, Sparkles, CheckCircle2, RotateCcw, Building2, Cloud, MessageSquare } from "lucide-react";

interface DocumentTemplate {
    id: string;
    title: string;
    icon: React.ReactNode;
    type: string;
    vendor: string;
    date: string;
    category: string;
    amount: string;
    confidence: string;
    lines: string[];
}

export function PlaygroundDemo() {
    const templates: DocumentTemplate[] = [
        {
            id: "aws",
            title: "AWS Cloud Invoice",
            icon: <Cloud className="w-5 h-5 text-sky-400" />,
            type: "invoice",
            vendor: "Amazon Web Services",
            date: "May 28, 2026",
            category: "Hosting",
            amount: "$142.50",
            confidence: "99.8%",
            lines: ["EC2 Compute Instances - $98.00", "S3 Storage Allocation - $24.50", "Route53 DNS Hosting - $20.00"]
        },
        {
            id: "uber",
            title: "Uber Business Receipt",
            icon: <Building2 className="w-5 h-5 text-emerald-400" />,
            type: "receipt",
            vendor: "Uber Technologies",
            date: "May 30, 2026",
            category: "Travel",
            amount: "$42.50",
            confidence: "99.2%",
            lines: ["Business Ride (SF Office) - $35.00", "Service Fee & Tips - $7.50"]
        },
        {
            id: "slack",
            title: "Slack SaaS Invoice",
            icon: <MessageSquare className="w-5 h-5 text-indigo-400" />,
            type: "invoice",
            vendor: "Slack Technologies",
            date: "Jun 01, 2026",
            category: "Software",
            amount: "$220.00",
            confidence: "99.6%",
            lines: ["Slack Pro Subscription (22 seats) - $220.00"]
        }
    ];

    const [activeTab, setActiveTab] = useState<string>("aws");
    const [scanState, setScanState] = useState<"idle" | "scanning" | "populating" | "complete">("idle");
    const [progress, setProgress] = useState(0);
    const [typedData, setTypedData] = useState({ vendor: "", date: "", category: "", amount: "" });

    const activeDoc = templates.find(t => t.id === activeTab) || templates[0];

    useEffect(() => {
        setScanState("idle");
        setProgress(0);
        setTypedData({ vendor: "", date: "", category: "", amount: "" });
    }, [activeTab]);

    const handleStartScan = () => {
        if (scanState !== "idle") return;
        setScanState("scanning");
        setProgress(0);

        let currentProgress = 0;
        const interval = setInterval(() => {
            currentProgress += 5;
            setProgress(currentProgress);
            if (currentProgress >= 100) {
                clearInterval(interval);
                setScanState("populating");
                startTypingEffect();
            }
        }, 100);
    };

    const startTypingEffect = () => {
        const fullVendor = activeDoc.vendor;
        const fullDate = activeDoc.date;
        const fullCategory = activeDoc.category;
        const fullAmount = activeDoc.amount;

        let index = 0;
        const maxLen = Math.max(fullVendor.length, fullDate.length, fullCategory.length, fullAmount.length);

        const typingInterval = setInterval(() => {
            index++;
            setTypedData({
                vendor: fullVendor.slice(0, Math.min(index, fullVendor.length)),
                date: fullDate.slice(0, Math.min(index, fullDate.length)),
                category: fullCategory.slice(0, Math.min(index, fullCategory.length)),
                amount: fullAmount.slice(0, Math.min(index, fullAmount.length))
            });

            if (index >= maxLen) {
                clearInterval(typingInterval);
                setScanState("complete");
            }
        }, 30);
    };

    return (
        <div className="w-full bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md shadow-2xl flex flex-col xl:flex-row gap-8">
            {/* Left: Document Simulator */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
                    {templates.map(t => (
                        <button
                            key={t.id}
                            id={`tab-select-${t.id}`}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap ${activeTab === t.id ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-white border border-transparent'}`}
                        >
                            {t.icon}
                            {t.title}
                        </button>
                    ))}
                </div>

                <div className="relative border border-slate-800/80 bg-slate-950/80 rounded-2xl p-6 min-h-[300px] flex flex-col justify-between overflow-hidden shadow-inner">
                    {scanState === "scanning" && (
                        <div className="absolute left-0 w-full h-1 bg-linear-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] z-20 animate-laser-scan" />
                    )}

                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-900 pb-4">
                            <div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Document Source</span>
                                <h4 className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                                    {activeDoc.icon}
                                    {activeDoc.vendor}
                                </h4>
                            </div>
                            <span className="bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-wider">{activeDoc.type}</span>
                        </div>

                        <div className="space-y-2">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Line Items</span>
                            <div className="space-y-1">
                                {activeDoc.lines.map((line, idx) => (
                                    <div key={idx} className="text-xs font-mono text-slate-300 flex justify-between bg-slate-900/40 p-2 rounded border border-slate-900">
                                        <span>{line.split(" - ")[0]}</span>
                                        <span className="text-white font-semibold">{line.split(" - ")[1]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-between items-end border-t border-slate-900 pt-4">
                        <div>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Issue Date</span>
                            <div className="text-xs text-slate-300 mt-0.5">{activeDoc.date}</div>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Total Invoice Amount</span>
                            <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">{activeDoc.amount}</div>
                        </div>
                    </div>

                    {scanState === "idle" && (
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                            <button
                                id="btn-start-scan"
                                onClick={handleStartScan}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3.5 rounded-full shadow-[0_0_30px_rgba(79,70,229,0.4)] active:scale-95 transition-all cursor-pointer text-sm"
                            >
                                <Play className="w-4 h-4 fill-white" />
                                Run AI Extraction Scan
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Live Ledger View */}
            <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Live Account Ledger</span>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Active Feed</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {/* Scanning Row */}
                        {scanState !== "idle" && (
                            <div className={`p-4 rounded-2xl border transition-all duration-300 bg-linear-to-r from-slate-950 to-slate-900 ${scanState === 'complete' ? 'border-emerald-500/30' : 'border-indigo-500/20'}`}>
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className={`w-4 h-4 ${scanState === 'complete' ? 'text-emerald-400' : 'text-indigo-400 animate-pulse'}`} />
                                        <span className="text-xs font-bold text-white">
                                            {scanState === 'scanning' ? 'AI OCR Processing...' : scanState === 'populating' ? 'Extracting Fields...' : 'Scan Complete'}
                                        </span>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${scanState === 'complete' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 animate-pulse'}`}>
                                        {scanState === 'complete' ? <CheckCircle2 className="w-3 h-3" /> : null}
                                        {scanState === 'complete' ? `Extracted (${activeDoc.confidence})` : `Processing ${progress}%`}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Vendor</span>
                                        <span className="text-slate-300 block truncate min-h-[16px]">{typedData.vendor || "—"}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Date</span>
                                        <span className="text-slate-300 block truncate min-h-[16px]">{typedData.date || "—"}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Category</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${typedData.category ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/40' : 'text-slate-505'}`}>
                                            {typedData.category || "—"}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[9px] uppercase font-bold text-slate-500 block">Amount</span>
                                        <span className="text-emerald-400 font-bold block min-h-[16px]">{typedData.amount || "—"}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* GitHub Row */}
                        <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-950/40 opacity-70 hover:opacity-100 transition-opacity">
                            <div className="flex justify-between items-center mb-3 text-xs font-semibold">
                                <span className="text-slate-400">GitHub Enterprise</span>
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Paid</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] font-mono text-slate-500">
                                <div><span className="block text-slate-400">GitHub Inc.</span></div>
                                <div><span>May 25, 2026</span></div>
                                <div><span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400">Software</span></div>
                                <div className="text-right"><span className="text-slate-300 font-semibold">$840.00</span></div>
                            </div>
                        </div>

                        {/* Starbucks Row */}
                        <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-950/40 opacity-70 hover:opacity-100 transition-opacity">
                            <div className="flex justify-between items-center mb-3 text-xs font-semibold">
                                <span className="text-slate-400">Starbucks Coffee</span>
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Paid</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] font-mono text-slate-500">
                                <div><span className="block text-slate-400">Starbucks #4810</span></div>
                                <div><span>May 24, 2026</span></div>
                                <div><span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400">Meals</span></div>
                                <div className="text-right"><span className="text-slate-300 font-semibold">$18.40</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {scanState === "complete" && (
                    <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center animate-in fade-in">
                        <span className="text-xs text-slate-400">Simulate scanning another document:</span>
                        <button
                            id="btn-reset-demo"
                            onClick={() => {
                                setScanState("idle");
                                setProgress(0);
                                setTypedData({ vendor: "", date: "", category: "", amount: "" });
                            }}
                            className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Demo
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
