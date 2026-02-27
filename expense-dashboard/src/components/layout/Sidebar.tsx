import Link from "next/link";
import { LayoutDashboard, FileText, Users, BarChart3, Settings } from "lucide-react";

export function Sidebar() {
  return (
    <div className="w-64 bg-slate-900 h-screen p-4 flex flex-col text-slate-300">
      <div className="text-white font-bold text-xl mb-8 tracking-tight">
        NonProfit<span className="text-emerald-400">Ledger</span>
      </div>
      
      <nav className="flex-1 space-y-2">
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </Link>
        <Link href="/ledger" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <FileText size={20} />
          <span>Ledger</span>
        </Link>
        <Link href="/vendors" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <Users size={20} />
          <span>Vendors</span>
        </Link>
        <Link href="/reports" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <BarChart3 size={20} />
          <span>Reports</span>
        </Link>
      </nav>

      <div className="mt-auto">
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <Settings size={20} />
          <span>Settings</span>
        </Link>
      </div>
    </div>
  );
}
