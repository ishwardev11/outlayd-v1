"use client";

import { motion } from "framer-motion";
import { Navbar, Footer } from "../page";

export default function PrivacyPolicyPage() {
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
                            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4">Privacy Policy</h1>
                            <p className="text-slate-400 text-lg">Last Updated: May 8, 2026</p>
                        </div>

                        <div className="max-w-none text-slate-300 space-y-6 text-lg leading-relaxed">
                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">1. Introduction</h2>
                            <p>
                                Welcome to Outlayd ("we," "our," or "us"). We are committed to protecting your personal and corporate information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our B2B expense management and procurement software (collectively, the "Services").
                            </p>
                            <p>
                                By accessing or using the Services, you agree to the collection and use of information in accordance with this Privacy Policy.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">2. Information We Collect</h2>
                            <p>
                                We collect information that you voluntarily provide to us when you register for the Services, express an interest in obtaining information about us or our products, or otherwise contact us.
                            </p>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li><strong>Account and Profile Data:</strong> Name, email address, password, company name, role, and business contact information.</li>
                                <li><strong>Financial and Transaction Data:</strong> Billing address and subscription details. Payment processing is handled securely by our third-party payment processor (e.g., Stripe), and we do not store your full credit card numbers on our servers.</li>
                                <li><strong>User-Generated Content:</strong> Receipts, invoices, procurement bids, ledger data, and other documents you upload to the Services for expense tracking and categorization.</li>
                                <li><strong>Automatically Collected Data:</strong> IP addresses, browser type, operating system, access times, and interaction data via standard tracking technologies to maintain the security and operation of our Services.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">3. How We Use Your Information</h2>
                            <p>
                                We use the information we collect or receive for the legitimate business purposes described below:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li><strong>To Provide and Maintain Our Services:</strong> Including facilitating account creation, logging you in, and managing your subscription.</li>
                                <li><strong>To Process Expense Data (AI Integration):</strong> We utilize third-party artificial intelligence models to provide core functionality, such as Optical Character Recognition (OCR) and automated data extraction from the receipts and invoices you upload.</li>
                                <li><strong>To Improve Our Platform:</strong> Analyzing usage trends to optimize the user interface and develop new features.</li>
                                <li><strong>To Communicate With You:</strong> Sending administrative information, security alerts, product updates, and customer support responses.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">4. How We Share Your Information</h2>
                            <p>
                                We do not sell your personal or corporate data to third parties. We only share information with the following categories of third parties as necessary to provide our Services:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li><strong>Cloud Computing &amp; Storage Providers:</strong> For secure database hosting and document storage.</li>
                                <li><strong>Payment Processors:</strong> To securely manage subscription billing.</li>
                                <li><strong>Artificial Intelligence Providers:</strong> Documents uploaded for extraction are temporarily processed via secure APIs (such as Google Generative AI) strictly for the purpose of returning structured data to your dashboard. We do not permit these providers to train their public foundational models on your proprietary business documents.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">5. Data Security</h2>
                            <p>
                                We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">6. Your Data Rights</h2>
                            <p>
                                Depending on your location, you may have the right to:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 mt-4 text-slate-300">
                                <li>Access, request a copy of, or correct your personal information.</li>
                                <li>Request the deletion of your account and associated financial data.</li>
                                <li>Opt-out of marketing communications.</li>
                            </ul>
                            <p>
                                To exercise these rights, please contact us using the information provided below.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">7. International Data Transfers</h2>
                            <p>
                                Our servers and primary operations are located in Malaysia. If you are accessing the Services from outside Malaysia, please be aware that your information may be transferred to, stored, and processed by us in our facilities and by those third parties with whom we may share your personal information.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">8. Updates to This Policy</h2>
                            <p>
                                We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. The updated version will be indicated by an updated "Last Updated" date at the top of this document.
                            </p>

                            <h2 className="text-2xl font-bold text-slate-200 mt-10 mb-4">9. Contact Us</h2>
                            <p>
                                If you have questions or comments about this policy, you may email us at:<br />
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
