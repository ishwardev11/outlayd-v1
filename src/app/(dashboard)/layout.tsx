import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
            <div className="sticky top-0 h-screen shrink-0">
                <Sidebar />
            </div>
            <main className="flex-1 w-full bg-gray-50 dark:bg-slate-950">
                {children}
            </main>
        </div>
    );
}
