import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar, Footer } from "../page";

export const metadata: Metadata = {
    title: "Privacy Policy | Outlayd",
    description: "How Outlayd collects, uses, shares and protects personal data, including the data of your donors and payees.",
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

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
            <Navbar />
            <main className="pt-24 pb-32 px-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 -z-10" />
                <div className="container mx-auto max-w-4xl">
                    <div className="mb-12 border-b border-white/10 pb-8">
                        <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4">Privacy Policy</h1>
                        <p className="text-slate-400 text-lg">Last updated: 23 November 2026</p>
                    </div>

                    <div className="text-slate-300 space-y-6 text-lg leading-relaxed">
                        <Section n={1} title="About this policy">
                            <p>
                                Outlayd (&quot;we&quot;, &quot;us&quot;) provides bookkeeping and financial statement software for nonprofits and small
                                businesses: reading receipts and bills with AI, recording money in and out, donor receipts, funds, invoices, assets and
                                loans, reconciliations and financial statements (together, the &quot;Services&quot;). This policy explains what personal
                                data we handle, why, who we share it with, and the choices you have. We follow Malaysia&apos;s Personal Data Protection
                                Act 2010 (PDPA).
                            </p>
                            <p>
                                There are two kinds of data in Outlayd. <strong>Account data</strong> is about you as a user (your name, email, how you
                                use the Services); we decide how it is used. <strong>Organisation records</strong> are what your organisation records
                                in Outlayd, including the names and details of your donors, payees, suppliers and customers. For those records your
                                organisation decides what is collected and why, and we process them on its behalf to provide the Services.
                            </p>
                        </Section>

                        <Section n={2} title="What we collect">
                            <List>
                                <li><strong>Account and team data:</strong> your name, email address, password (stored only as a secure hash by our sign-in provider), the organisations you belong to and your role in each (Admin, Editor or Viewer), and invitations you send or receive.</li>
                                <li><strong>Organisation settings:</strong> the organisation&apos;s name, legal name, address, registration number, currency, financial year, letterhead image, signatories, payment details for invoices, and tax-exemption reference if you enter one.</li>
                                <li><strong>Documents you upload:</strong> receipts, bills, invoices, bank statements and attachments, and the details read from them.</li>
                                <li><strong>Organisation records:</strong> money in and out, donations and donor receipts, payees and donors (names and any address, email or notes you add), invoices, funds, accounts, assets and loans, reconciliations, period locks and their reasons.</li>
                                <li><strong>History of changes:</strong> to keep your books trustworthy, Outlayd records who created, changed or deleted records, when, and the values before and after. This history cannot be edited.</li>
                                <li><strong>Billing data:</strong> your subscription status and the customer and subscription references from our payment provider. We never see or store your full card number.</li>
                                <li><strong>Contact form:</strong> the name, email address and message you send us. To stop abuse we keep a one-way scrambled form of your IP address for up to two days; we never store the address itself.</li>
                                <li><strong>Technical data:</strong> the cookies described in section 7, and standard server logs (such as time, page requested and errors) kept by our hosting providers to run and secure the Services.</li>
                            </List>
                        </Section>

                        <Section n={3} title="How we use it">
                            <List>
                                <li>To provide the Services: signing you in, keeping each organisation&apos;s records separate and private to its members, reading your documents, and producing your statements, receipts and exports.</li>
                                <li>To apply your plan: the features and limits of your subscription, and billing through our payment provider.</li>
                                <li>To keep the Services secure: preventing misuse, investigating errors, and keeping the history of changes.</li>
                                <li>To communicate with you: answering your messages, invitations to an organisation, and important notices about your account or these policies.</li>
                            </List>
                            <p>
                                We do not sell personal data, we do not use it for advertising, and we do not use your documents or records to train AI
                                models.
                            </p>
                        </Section>

                        <Section n={4} title="Who we share it with">
                            <p>Only with the service providers we need to run Outlayd, each for its own part:</p>
                            <List>
                                <li><strong>Supabase:</strong> our database, file storage and sign-in.</li>
                                <li><strong>Vercel:</strong> hosting of the website and application.</li>
                                <li><strong>Google (Gemini API):</strong> when you upload a document or bank statement, it is sent to Google&apos;s Gemini API so the details can be read and returned to you. Google&apos;s handling of this data is governed by its terms for API customers.</li>
                                <li><strong>Stripe:</strong> subscription payments. Stripe collects your card details directly.</li>
                                <li><strong>Resend:</strong> delivery of messages sent through our contact form.</li>
                            </List>
                            <p>
                                Within your organisation, members see the organisation&apos;s records according to their role. We may also disclose data
                                where the law requires it, or to protect the rights, property or safety of our users or the public.
                            </p>
                        </Section>

                        <Section n={5} title="Where it is stored">
                            <p>
                                Our providers may store and process data outside Malaysia. Where they do, we rely on their contractual and security
                                commitments to protect it to a standard comparable to the PDPA.
                            </p>
                        </Section>

                        <Section n={6} title="How long we keep it, and deleting it">
                            <List>
                                <li>We keep your organisation&apos;s records for as long as the organisation exists in Outlayd, so you can produce statements for past years and show your auditor what happened.</li>
                                <li>If you stop paying, nothing is deleted: paid features become read-only and you can still view and export your records.</li>
                                <li>An Admin can delete the organisation in Settings. This cancels any subscription, permanently deletes all of the organisation&apos;s records, history and uploaded files, and deletes the logins of members who belong to no other organisation. It cannot be undone, so export what you need first.</li>
                                <li>Copies may remain in our providers&apos; backups for a limited time before they are overwritten.</li>
                                <li>Contact-form scrambled IP entries are removed after two days; contact messages are kept in our email for as long as needed to deal with them.</li>
                            </List>
                        </Section>

                        <Section n={7} title="Cookies">
                            <p>
                                We use only the cookies the Services need: sign-in cookies that keep you logged in, and a cookie that remembers which of
                                your organisations is active. We do not use advertising or tracking cookies. Some screens also remember small
                                preferences in your browser (for example, that you hid the &quot;Getting started&quot; card).
                            </p>
                        </Section>

                        <Section n={8} title="Security">
                            <p>
                                Data is encrypted in transit. Each organisation&apos;s records are separated in the database itself, so members of one
                                organisation cannot read another&apos;s, and paid features and roles are enforced on our servers, not only on screen.
                                Uploaded files are stored privately and served only to members of their organisation. No system is completely secure;
                                if a breach affects your personal data we will tell the affected organisations without undue delay, and the authorities
                                where the law requires it.
                            </p>
                        </Section>

                        <Section n={9} title="Your organisation's responsibilities for donor and payee data">
                            <p>
                                If your organisation records the personal data of donors, payees, suppliers or customers in Outlayd, it is responsible
                                for having a lawful reason to do so and for telling those people how their data is used, as the PDPA requires. Please
                                record only what you need: a donor&apos;s name and the details needed for a receipt, not identity card numbers, health
                                information or other sensitive data. Requests from those people about their data should go to your organisation; we
                                will help your organisation respond.
                            </p>
                        </Section>

                        <Section n={10} title="Your rights">
                            <p>Under the PDPA you may:</p>
                            <List>
                                <li>ask to see the personal data we hold about you, and for a copy;</li>
                                <li>ask us to correct it if it is wrong;</li>
                                <li>withdraw your consent, or ask us to stop processing it (this may mean we can no longer provide the Services to you);</li>
                                <li>ask us to delete your account.</li>
                            </List>
                            <p>You can change most account and organisation details yourself in Settings. For anything else, email us (section 12). We may need to confirm your identity first.</p>
                        </Section>

                        <Section n={11} title="Changes to this policy">
                            <p>
                                We will update this policy when our practices or the law change, and change the date at the top. If a change is
                                significant, we will tell Admins by email or in the app before it takes effect.
                            </p>
                        </Section>

                        <Section n={12} title="Contact us">
                            <p>
                                Questions or requests about privacy: <a href={`mailto:${CONTACT}`} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{CONTACT}</a>, or
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
