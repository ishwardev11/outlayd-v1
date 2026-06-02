import { Receipt } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Background ambient glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="flex justify-center">
                    <Link href="/" id="auth-logo-link" className="flex items-center gap-3 group">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-transform duration-300 group-hover:scale-105 active:scale-95">
                            <Receipt className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-2xl font-bold tracking-tight text-white transition-opacity duration-300 hover:opacity-90">Outlayd</span>
                    </Link>
                </div>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
                <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10">
                    {children}
                </div>
            </div>
        </div>
    );
}
