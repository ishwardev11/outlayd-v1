"use client";

// Landing page questions as an accordion: one answer open at a time, the first open to start with.
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
    { q: "What statements can Outlayd produce?", a: "On the Growth and Nonprofit plans: Profit and Loss for a business (Income and Expenditure for a nonprofit), Receipts and Payments, Financial Position and Changes in Funds, plus schedules for fixed assets, money owed and donations. Each comes with checks that it adds up, and as a PDF with your letterhead and signatures. Free plans can look at a sample." },
    { q: "How accurate is the AI reading?", a: "It reads most printed receipts and invoices well, including foreign currencies and multi-page invoices with line items. Nothing counts until someone in your team has checked and approved it." },
    { q: "What does the AI do on each plan?", a: "On every plan it reads the receipts and bills you upload: 5 a month on Free, unlimited on Growth and Nonprofit. Growth and Nonprofit also get AI help up to 300 times a month: it fills in an invoice from one you already issued, matches a payment slip to the invoice it pays, and suggests categories for new contacts. The AI only suggests; nothing is saved until you check it. Documents are processed by Google's Gemini API, as our Privacy Policy explains." },
    { q: "Can I keep grants and restricted funds separate?", a: "Yes. Every receipt, donation and invoice line belongs to a fund, each fund has its own balance, and the statements show restricted and unrestricted funds separately. Creating funds is part of the Growth and Nonprofit plans." },
    { q: "Do I still need an accountant or auditor?", a: "Outlayd keeps your books and prepares the statements. If your company, constitution or a funder needs them audited, your auditor still signs them off, with a clean ledger, an audit log of every change and an export for their own software." },
    { q: "What happens if I stop paying?", a: "Nothing is deleted. Paid features become read-only, and you can still view and export everything you recorded. You can cancel any time; there are no contracts." },
    { q: "Is there a discount for nonprofits?", a: "Yes. Registered societies, charities and NGOs get every Growth feature for RM49 a month instead of RM89. Apply on our contact page and we send you a code to use at checkout." },
];

export function LandingFaq() {
    const [open, setOpen] = useState(0);
    return (
        <div className="min-w-0 flex-[999_1_560px] rounded-3xl border border-black/[0.08] bg-white p-2">
            {FAQS.map((f, i) => {
                const isOpen = open === i;
                return (
                    <div key={f.q} className={`rounded-2xl ${isOpen ? "bg-neutral-50" : ""}`}>
                        <h3 className="m-0">
                            <button
                                type="button"
                                id={`faq-q-${i}`}
                                aria-expanded={isOpen}
                                aria-controls={`faq-a-${i}`}
                                onClick={() => setOpen(isOpen ? -1 : i)}
                                className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 rounded-2xl p-4 text-left text-[15px] font-medium text-neutral-900"
                            >
                                {f.q}
                                <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                        </h3>
                        {isOpen && (
                            <p id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="m-0 pb-5 pl-4 pr-12 text-[15px] leading-relaxed text-neutral-600">
                                {f.a}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
