import { Sidebar } from "@/components/layout/Sidebar";
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
                <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
                    <div className="sticky top-0 h-screen shrink-0">
                        <Sidebar />
                    </div>
                    <main className="flex-1 w-full bg-gray-50 dark:bg-slate-950">
                        {children}
                    </main>
                </div>
            </CurrencyProvider>
        </RoleProvider>
    );
}

