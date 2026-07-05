import { Receipt } from "lucide-react";
import WizardForm from "@/components/onboarding/WizardForm";

export default function OnboardingPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center transition-colors duration-200">
            {/* Brand / Logo Area */}
            <div className="mb-10 text-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <Receipt className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Welcome to Outlayd</h1>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Let&apos;s get your workspace set up in just a few steps.</p>
            </div>

            <WizardForm />
        </div>
    );
}
