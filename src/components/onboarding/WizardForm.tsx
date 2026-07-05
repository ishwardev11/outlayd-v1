"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Church, Users, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { completeOnboardingSetup } from "@/app/actions/onboarding";

// UI Components from shadcn or custom 
// Assuming standard Tailwind classes since we don't have all shadcn components verified
import { Button } from "@/components/ui/button";

// interface Invite {
//     email: string;
//     role: string;
// }

interface FormData {
    orgName: string;
    baseCurrency: string;
    fiscalYearStart: string;
    templateChoice: "digital_agency" | "ecommerce" | "non_profit" | "";
    // invites: Invite[];
}

export default function WizardForm() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState<FormData>({
        orgName: "",
        baseCurrency: "USD",
        fiscalYearStart: "1",
        templateChoice: "",
        // invites: [{ email: "", role: "Viewer" }, { email: "", role: "Viewer" }],
    });

    const updateFormData = <K extends keyof FormData>(field: K, value: FormData[K]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // const handleInviteChange = (index: number, field: keyof Invite, value: string) => {
    //     const newInvites = [...formData.invites];
    //     newInvites[index] = { ...newInvites[index], [field]: value };
    //     updateFormData("invites", newInvites);
    // };

    // const addInviteRow = () => {
    //     updateFormData("invites", [...formData.invites, { email: "", role: "Viewer" }]);
    // };

    // const removeInviteRow = (index: number) => {
    //     const newInvites = formData.invites.filter((_, i) => i !== index);
    //     updateFormData("invites", newInvites);
    // };

    const nextStep = () => {
        if (step === 1 && !formData.orgName.trim()) return; // Simple validation
        if (step === 2 && !formData.templateChoice) return;
        setStep((prev) => Math.min(prev + 1, 2));
    };

    const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

    const handleSubmit = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        // Filter out empty invites
        const finalData = {
            ...formData,
            // invites: formData.invites.filter(inv => inv.email.trim() !== "")
        };

        const result = await completeOnboardingSetup(finalData);

        if (result.success) {
            router.push("/dashboard");
        } else {
            console.error(result.error);
            alert("Failed to complete setup: " + result.error);
            setIsSubmitting(false);
        }
    };

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 50 : -50,
            opacity: 0,
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 50 : -50,
            opacity: 0,
        }),
    };

    const direction = 1; // Simplification for Framer Motion key switching

    return (
        <div className="w-full max-w-3xl mx-auto">
            {/* Progress Indicator */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Step {step} of 2</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {step === 1 ? "Organization Profile" : "Starter Templates"}
                    </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-2 overflow-hidden">
                    <div
                        className="bg-indigo-600 dark:bg-indigo-500 h-2 transition-all duration-500 ease-in-out"
                        style={{ width: `${(step / 2) * 100}%` }}
                    />
                </div>
            </div>

            {/* Form Content */}
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800/80 p-8 min-h-[400px] relative overflow-hidden backdrop-blur-md">
                <AnimatePresence mode="wait" custom={direction}>
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            custom={direction}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="space-y-6"
                        >
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Tell us about your organization</h2>
                                <p className="text-slate-500 dark:text-slate-400 mt-1">This will be used for your main profile and reporting.</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="org-name-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Organization Legal Name *</label>
                                    <input
                                        id="org-name-input"
                                        type="text"
                                        required
                                        value={formData.orgName}
                                        onChange={(e) => updateFormData("orgName", e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400"
                                        placeholder="e.g. Hope Foundation"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="currency-select" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base Currency</label>
                                        <select
                                            id="currency-select"
                                            value={formData.baseCurrency}
                                            onChange={(e) => updateFormData("baseCurrency", e.target.value)}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-900 dark:text-white"
                                        >
                                            <option value="USD">USD ($)</option>
                                            <option value="EUR">EUR (€)</option>
                                            <option value="GBP">GBP (£)</option>
                                            <option value="CAD">CAD ($)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="fiscal-month-select" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fiscal Year Start Month</label>
                                        <select
                                            id="fiscal-month-select"
                                            value={formData.fiscalYearStart}
                                            onChange={(e) => updateFormData("fiscalYearStart", e.target.value)}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-900 dark:text-white"
                                        >
                                            <option value="1">January</option>
                                            <option value="4">April</option>
                                            <option value="7">July</option>
                                            <option value="10">October</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 flex justify-end">
                                <Button
                                    id="wizard-continue-btn"
                                    onClick={nextStep}
                                    disabled={!formData.orgName.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition-all duration-200 active:scale-[0.98]"
                                >
                                    Continue <ArrowRight className="ml-2 w-4 h-4" />
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            custom={direction}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="space-y-6"
                        >
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Choose a Starter Template</h2>
                                <p className="text-slate-500 dark:text-slate-400 mt-1">We&apos;ll configure your default categories and funds based on your choice.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Card 1 */}
                                <button
                                    id="template-digital-agency-btn"
                                    onClick={() => updateFormData("templateChoice", "digital_agency")}
                                    className={`relative p-6 text-left rounded-xl border-2 transition-all duration-200 active:scale-[0.98] cursor-pointer ${formData.templateChoice === "digital_agency"
                                        ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-md"
                                        : "border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm"
                                        }`}
                                >
                                    {formData.templateChoice === "digital_agency" && (
                                        <CheckCircle2 className="absolute top-4 right-4 text-indigo-600 dark:text-indigo-400 w-5 h-5" />
                                    )}
                                    <Building2 className={`w-8 h-8 mb-4 ${formData.templateChoice === "digital_agency" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Digital Agency & SaaS</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3">Standard B2B categories for software, marketing, and professional services.</p>
                                </button>

                                {/* Card 2 */}
                                <button
                                    id="template-ecommerce-btn"
                                    onClick={() => updateFormData("templateChoice", "ecommerce")}
                                    className={`relative p-6 text-left rounded-xl border-2 transition-all duration-200 active:scale-[0.98] cursor-pointer ${formData.templateChoice === "ecommerce"
                                        ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-md"
                                        : "border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm"
                                        }`}
                                >
                                    {formData.templateChoice === "ecommerce" && (
                                        <CheckCircle2 className="absolute top-4 right-4 text-indigo-600 dark:text-indigo-400 w-5 h-5" />
                                    )}
                                    <Church className={`w-8 h-8 mb-4 ${formData.templateChoice === "ecommerce" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">E-Commerce & Retail</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3">Optimized for inventory, shipping, and merchant fees.</p>
                                </button>

                                {/* Card 3 */}
                                <button
                                    id="template-non-profit-btn"
                                    onClick={() => updateFormData("templateChoice", "non_profit")}
                                    className={`relative p-6 text-left rounded-xl border-2 transition-all duration-200 active:scale-[0.98] cursor-pointer ${formData.templateChoice === "non_profit"
                                        ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-md"
                                        : "border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm"
                                        }`}
                                >
                                    {formData.templateChoice === "non_profit" && (
                                        <CheckCircle2 className="absolute top-4 right-4 text-indigo-600 dark:text-indigo-400 w-5 h-5" />
                                    )}
                                    <Users className={`w-8 h-8 mb-4 ${formData.templateChoice === "non_profit" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Non-Profit Org</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3">Built for compliance with grant tracking and fundraising expenses.</p>
                                </button>
                            </div>

                            <div className="pt-6 flex justify-between items-center">
                                <Button id="wizard-back-btn" variant="ghost" onClick={prevStep} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer active:scale-[0.98]">
                                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                                </Button>
                                <Button
                                    id="wizard-complete-btn"
                                    onClick={handleSubmit}
                                    disabled={!formData.templateChoice || isSubmitting}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[240px] cursor-pointer transition-all duration-200 active:scale-[0.98]"
                                >
                                    {isSubmitting ? (
                                        <div className="flex items-center">
                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Setting up your workspace...
                                        </div>
                                    ) : "Complete Setup & Go to Dashboard"}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
