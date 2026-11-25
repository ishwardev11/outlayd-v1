import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { RoleProvider } from "@/components/RoleProvider";
import { PlanProvider } from "@/components/PlanProvider";
import { createClient } from "@/utils/supabase/server";
import { getPlanState } from "@/utils/plan";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { getCurrentUserRole, getOrganizationCurrency, getOrganizationId } from "@/app/actions/document-utils";
import { getMyPendingInvites } from "@/app/actions/settings";
import { PendingInviteBanner } from "@/components/layout/PendingInviteBanner";
import { LockProvider } from "@/components/LockProvider";
import { getLockState } from "@/app/actions/assurance";

// Browser tab titles: each page gives its own ("Inbox"), shown as "Inbox | Outlayd" (simplification step 8)
export const metadata: Metadata = { title: { template: "%s | Outlayd", default: "Outlayd" } };

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const role = await getCurrentUserRole();
    const currency = await getOrganizationCurrency();
    const pendingInvites = await getMyPendingInvites();
    const plan = await getPlanState(await createClient(), await getOrganizationId());
    const lock = await getLockState();

    return (
        <RoleProvider role={role}>
            <PlanProvider paid={plan.paid} hasBeenPaid={plan.hasBeenPaid}>
            <LockProvider lockDate={lock.lockDate} startDate={lock.startDate}>
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
                        <PendingInviteBanner invites={pendingInvites} />
                        {children}
                    </main>
                </div>
            </CurrencyProvider>
            </LockProvider>
            </PlanProvider>
        </RoleProvider>
    );
}

