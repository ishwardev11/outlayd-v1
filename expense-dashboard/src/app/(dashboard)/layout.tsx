import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { RoleProvider } from "@/components/RoleProvider";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { getCurrentUserRole, getOrganizationCurrency } from "@/app/actions/document-utils";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const role = await getCurrentUserRole();
    const currency = await getOrganizationCurrency();

    return (
        <RoleProvider role={role}>
            <CurrencyProvider currency={currency}>
                <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 dark:bg-slate-950">
                    {/* Desktop Persistent Sidebar */}
                    <div className="hidden md:block sticky top-0 h-screen shrink-0">
                        <Sidebar />
                    </div>

                    {/* Mobile Navigation (Top Bar + Drawer + Bottom Tabs) */}
                    <MobileNav />

                    {/* Main Content Area */}
                    <main className="flex-1 w-full min-w-0 bg-gray-50 dark:bg-slate-950 pb-6 md:pb-0">
                        {children}
                    </main>
                </div>
            </CurrencyProvider>
        </RoleProvider>
    );
}

