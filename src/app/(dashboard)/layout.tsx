import { Sidebar } from "@/components/layout/Sidebar";
import { RoleProvider } from "@/components/RoleProvider";
import { getCurrentUserRole } from "@/app/actions/document-utils";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const role = await getCurrentUserRole();

    return (
        <RoleProvider role={role}>
            <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
                <div className="sticky top-0 h-screen shrink-0">
                    <Sidebar />
                </div>
                <main className="flex-1 w-full bg-gray-50 dark:bg-slate-950">
                    {children}
                </main>
            </div>
        </RoleProvider>
    );
}
