"use client";

import { motion } from "framer-motion";
import { Navbar, Footer } from "../page";

export default function TermsOfServicePage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
            <Navbar />
            <main className="pt-24 pb-32 px-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 -z-10" />
                
                <div className="container mx-auto max-w-4xl">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="mb-12 border-b border-white/10 pb-8">
                            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4">Terms of Service</h1>
                            <p className="text-slate-400 text-lg">Last Updated: May 8, 2026</p>
                        </div>

                        <div className="max-w-none text-slate-300 space-y-6 text-lg leading-relaxed">
                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">1. Acceptance of Terms</h2>
                            <p>
                                Welcome to Outlayd ("Company," "we," "us," or "our"). These Terms of Service ("Terms") govern your access to and use of the Outlayd website, application, and any related expense management, AI extraction, and procurement services (collectively, the "Services").
                            </p>
                            <p>
                                By registering for an account or using the Services, you agree to be bound by these Terms. If you are accepting these Terms on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to these Terms. If you do not agree with these Terms, you may not use the Services.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">2. Description of Services</h2>
                            <p>
                                Outlayd provides a B2B SaaS platform designed to assist businesses with ledger management, split categorization, procurement workflows, and AI-assisted data extraction from financial documents (such as receipts and invoices).
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">3. Account Registration and Security</h2>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li><strong>Eligibility:</strong> You must be at least 18 years old and capable of forming a binding contract to use the Services. The Services are intended strictly for business and commercial use.</li>
                                <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">4. Subscription Fees and Payments</h2>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li><strong>Billing:</strong> Access to premium features of the Services requires a paid subscription. All payments are processed securely through our third-party payment provider (e.g., Stripe).</li>
                                <li><strong>Renewals and Cancellations:</strong> Subscriptions automatically renew at the end of each billing cycle unless canceled prior to the renewal date. You may cancel your subscription at any time through your account settings.</li>
                                <li><strong>No Refunds:</strong> Unless otherwise required by law, all fees paid are non-refundable, including for partial months of service or unused features.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">5. AI Extraction and Financial Disclaimer</h2>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li><strong>AI Technology:</strong> Outlayd utilizes third-party artificial intelligence (including Google Gemini) to perform Optical Character Recognition (OCR) and categorize data from uploaded documents.</li>
                                <li><strong>Verification Required:</strong> While we strive for high accuracy, AI-generated outputs can occasionally contain errors, omissions, or miscategorizations. You are solely responsible for reviewing, verifying, and approving all extracted data, ledger entries, and procurement bids before relying on them.</li>
                                <li><strong>Not Accounting Advice:</strong> Outlayd is an administrative software tool, not a certified public accountant, tax advisor, or financial planner. The Services do not constitute professional accounting, tax, or legal advice.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">6. User Data and Content</h2>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li><strong>Your Data:</strong> You retain all ownership rights to the receipts, invoices, vendor quotes, and financial data you upload ("User Content").</li>
                                <li><strong>License to Process:</strong> By uploading User Content, you grant Outlayd a worldwide, non-exclusive, royalty-free license to host, copy, process, and transmit such content solely as necessary to provide the Services to you (including routing it through our secure AI sub-processors).</li>
                                <li><strong>Prohibited Content:</strong> You agree not to upload any documents containing highly sensitive personal data (e.g., medical records, government IDs) unless strictly required for a vendor invoice, or any illegal or fraudulent materials.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">7. Intellectual Property Rights</h2>
                            <p>
                                Outlayd and its original content, features, functionality, codebase, and branding (including the Outlayd logo and "Indigo/Amber" UI design) are owned by us and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, reverse engineer, or create derivative works from the Services.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">8. Prohibited Activities</h2>
                            <p>
                                You agree not to engage in any of the following:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li>Scraping, data mining, or using automated bots to extract data from the Services.</li>
                                <li>Attempting to bypass, disable, or interfere with security-related features.</li>
                                <li>Using the Services to compete with Outlayd or build a similar product.</li>
                                <li>Selling, reselling, or sublicensing your Outlayd account to unauthorized third parties.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">9. Disclaimer of Warranties</h2>
                            <p className="uppercase">
                                THE SERVICES ARE PROVIDED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS. OUTLAYD DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">10. Limitation of Liability</h2>
                            <p className="uppercase">
                                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL OUTLAYD, ITS DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICES. IN NO EVENT SHALL OUR TOTAL CUMULATIVE LIABILITY EXCEED THE AMOUNT YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">11. Indemnification</h2>
                            <p>
                                You agree to defend, indemnify, and hold harmless Outlayd from any claims, damages, obligations, losses, liabilities, costs, or debt arising from: (i) your use of and access to the Services; (ii) your violation of any term of these Terms; or (iii) your violation of any third-party right, including copyright, property, or privacy rights related to your User Content.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">12. Governing Law and Jurisdiction</h2>
                            <p>
                                These Terms shall be governed by and construed in accordance with the laws of Malaysia, without regard to its conflict of law provisions. Any legal action or proceeding arising under these Terms shall be brought exclusively in the courts located in Malaysia.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">13. Changes to Terms</h2>
                            <p>
                                We reserve the right to modify or replace these Terms at any time. We will provide notice of any material changes by posting the new Terms on the site or via email. Your continued use of the Services after such changes constitutes acceptance of the new Terms.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">14. Contact Us</h2>
                            <p>
                                If you have any questions about these Terms, please contact us at:<br />
                                <strong>Email:</strong> <a href="mailto:ishwardev011@gmail.com" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">ishwardev011@gmail.com</a>
                            </p>
                        </div>
                    </motion.div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
