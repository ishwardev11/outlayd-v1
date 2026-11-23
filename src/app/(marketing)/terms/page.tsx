import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar, Footer } from "../page";
import { PRICES } from "@/utils/plan-comparison";

export const metadata: Metadata = {
    title: "Terms of Service | Outlayd",
    description: "The terms for using Outlayd, bookkeeping and financial statement software for nonprofits and small businesses.",
};

const CONTACT = "ishwardev011@gmail.com";

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
    return (
        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-200 mt-10">{n}. {title}</h2>
            {children}
        </section>
    );
}
const List = ({ children }: { children: ReactNode }) => <ul className="list-disc pl-6 space-y-2 text-slate-300">{children}</ul>;

export default function TermsOfServicePage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
            <Navbar />
            <main className="pt-24 pb-32 px-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 -z-10" />
                <div className="container mx-auto max-w-4xl">
                    <div className="mb-12 border-b border-white/10 pb-8">
                        <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4">Terms of Service</h1>
                        <p className="text-slate-400 text-lg">Last updated: 23 November 2026</p>
                    </div>

                    <div className="text-slate-300 space-y-6 text-lg leading-relaxed">
                        <Section n={1} title="Agreement">
                            <p>
                                These terms govern your use of the Outlayd website and application (the &quot;Services&quot;), provided by Outlayd
                                (&quot;we&quot;, &quot;us&quot;). By creating an account or using the Services you agree to them. If you use the
                                Services for an organisation, you confirm you are allowed to accept these terms for it, and &quot;you&quot; includes
                                that organisation. Our <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Privacy Policy</Link> explains
                                how we handle personal data.
                            </p>
                        </Section>

                        <Section n={2} title="What Outlayd does">
                            <p>
                                Outlayd is bookkeeping software for nonprofits and small businesses. It reads receipts, bills and bank statements with
                                AI; records money in and out, donations and donor receipts, invoices, funds, accounts, assets and loans; and prepares
                                reconciliations, financial statements and exports from those records. We may improve, change or retire features over
                                time; if we remove something important from a paid plan, we will tell you in advance.
                            </p>
                        </Section>

                        <Section n={3} title="Accounts and your team">
                            <List>
                                <li>You must be at least 18 and give accurate details. Keep your password private; you are responsible for what happens under your login.</li>
                                <li>Each organisation has Admins, Editors and Viewers. Admins control the organisation&apos;s settings, members, billing, period locks and deletion, and are responsible for who they invite and the access they give.</li>
                                <li>Tell us straight away if you think someone has used your account without permission.</li>
                            </List>
                        </Section>

                        <Section n={4} title="Plans, prices and payment">
                            <List>
                                <li><strong>Free:</strong> one user and five AI document readings a month, with the features shown for the Free plan on our pricing page.</li>
                                <li><strong>Growth:</strong> RM{PRICES.growth} a month. <strong>Nonprofit:</strong> the same features for RM{PRICES.nonprofit} a month, for registered nonprofits we accept on application; we may ask for proof of registration and may end the nonprofit price if the organisation is no longer eligible, with notice.</li>
                                <li>Paid plans are billed monthly in advance through Stripe and renew automatically until cancelled. You can cancel at any time from Settings; you keep paid features until the end of the period you have paid for. Except where the law requires otherwise, payments are not refunded, including for part months.</li>
                                <li>We may change prices with at least 30 days&apos; notice; the new price applies from your next billing period after that.</li>
                                <li>If a payment fails, you keep access while Stripe retries it; if it still cannot be collected, the subscription may be cancelled and your organisation moves to the Free plan.</li>
                            </List>
                        </Section>

                        <Section n={5} title="Your records, and when a subscription ends">
                            <List>
                                <li>Your organisation owns its records and documents. You give us permission to store, process and transmit them only as needed to provide the Services, including through the service providers named in our Privacy Policy.</li>
                                <li>When a paid subscription ends, nothing is deleted: paid features become read-only, and you can still view and export what you recorded.</li>
                                <li>An Admin can delete the organisation in Settings. Deletion is permanent and removes all of its records, history and files. Export anything you need to keep (for example for statutory record-keeping) before deleting.</li>
                            </List>
                        </Section>

                        <Section n={6} title="AI reading, statements and your responsibility">
                            <List>
                                <li>AI reading can make mistakes. Nothing read from a document counts until a member of your organisation has checked and approved it, and you are responsible for checking it.</li>
                                <li>Financial statements, receipts and exports are prepared from the records you enter and approve. The checks Outlayd runs help find common problems; they do not guarantee that your records are complete or correct.</li>
                                <li>Outlayd is software, not an accountant, auditor, tax adviser or lawyer, and nothing in the Services is professional advice. You remain responsible for your books and for meeting your obligations, for example to the Registrar of Societies, the Inland Revenue Board (LHDN), your funders and your members, and for having your statements audited where required.</li>
                                <li>Period locks help keep reported figures unchanged, but an Admin can unlock a period (with a recorded reason). Keep your own copies of statements you submit.</li>
                            </List>
                        </Section>

                        <Section n={7} title="Donor receipts and tax exemption">
                            <p>
                                You may only turn on tax-exempt donation receipts if your organisation holds a current approval for tax-deductible
                                donations (for example under section 44(6) of the Income Tax Act 1967) and you enter its correct reference. You are
                                responsible for issuing receipts only for donations you actually received, and for the information on them.
                            </p>
                        </Section>

                        <Section n={8} title="Acceptable use">
                            <p>You agree not to:</p>
                            <List>
                                <li>use the Services for anything unlawful, fraudulent or misleading, including false receipts, invoices or statements;</li>
                                <li>upload data you have no right to, or sensitive personal data you do not need (such as identity card numbers or health information);</li>
                                <li>try to access another organisation&apos;s data, get around plan limits, roles or security, or disrupt the Services;</li>
                                <li>scrape the Services, or copy, resell or reverse engineer them.</li>
                            </List>
                            <p>
                                We may suspend or close an account that breaks these terms or puts other users at risk. Where we can, we will tell you
                                first and give you a chance to export your records.
                            </p>
                        </Section>

                        <Section n={9} title="Our intellectual property">
                            <p>
                                The Services, including the software, design and the Outlayd name and logo, belong to us. These terms give you the right
                                to use the Services, not ownership of them. If you send us suggestions, we may use them without owing you anything.
                            </p>
                        </Section>

                        <Section n={10} title="Availability and disclaimers">
                            <p>
                                We work to keep the Services available and your data safe, but we provide them &quot;as is&quot; and &quot;as
                                available&quot;. To the extent the law allows, we make no other promises, including that the Services will be
                                uninterrupted or error-free, or fit for a particular purpose.
                            </p>
                        </Section>

                        <Section n={11} title="Limits on our liability">
                            <p>
                                To the extent the law allows, we are not liable for indirect or consequential loss, or for loss of profit, revenue,
                                data or goodwill, arising from your use of the Services. Our total liability for any claims about the Services is
                                limited to the amount you paid us in the twelve months before the claim (or RM100 if you are on the Free plan). Nothing
                                in these terms limits liability that cannot be limited by law.
                            </p>
                        </Section>

                        <Section n={12} title="Indemnity">
                            <p>
                                You will cover our reasonable losses and costs from claims by others that arise from the records or documents you put in
                                the Services, or from your breach of these terms or of the law.
                            </p>
                        </Section>

                        <Section n={13} title="Changes to these terms">
                            <p>
                                We may update these terms. If a change is significant, we will tell Admins by email or in the app at least 30 days
                                before it takes effect. If you do not agree, you can cancel before then; using the Services after that date means you
                                accept the new terms.
                            </p>
                        </Section>

                        <Section n={14} title="Governing law">
                            <p>These terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction over any dispute about them.</p>
                        </Section>

                        <Section n={15} title="Contact us">
                            <p>
                                Questions about these terms: <a href={`mailto:${CONTACT}`} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{CONTACT}</a>, or
                                use our <Link href="/contact" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">contact form</Link>.
                            </p>
                        </Section>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
