import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Landmark } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { getCurrentUserRole, getOrganizationId } from "@/app/actions/document-utils"
import { getStatementDetail } from "@/app/actions/bank-statements"
import { getEntryOptions } from "@/app/actions/transactions"
import { getPlanState } from "@/utils/plan"
import { ReadOnlyPlanBanner } from "@/components/ui/ReadOnlyPlanBanner"
import { FeatureLocked } from "@/components/ui/FeatureLocked"
import { StatementReconciliation } from "@/components/bank/StatementReconciliation"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function BankStatementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    // A downgraded organisation can still open its existing statements, read-only
    const plan = await getPlanState(supabase, organizationId)
    if (!organizationId || (!plan.paid && !plan.hasBeenPaid)) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
                <FeatureLocked
                    title="Bank statements"
                    tagline="See which payments have paperwork, and which invoices are really paid."
                    heading="Bank Statement Import is a Growth feature"
                    features={["Upload a bank statement PDF and have its transactions read for you", "Each line is matched to an invoice, receipt or cash book entry, and you confirm it"]}
                    context="bank_statements"
                    icon={<Landmark className="h-4 w-4" />}
                />
            </div>
        )
    }

    const [detail, role] = await Promise.all([getStatementDetail(id), getCurrentUserRole()])
    if (!detail || detail.statement.status !== "ready") notFound()
    const canEdit = (role === "Admin" || role === "Editor") && plan.paid
    // The money in / money out form, to record an unmatched line (only for people who can write)
    const options = canEdit ? await getEntryOptions() : null

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
            <Link href="/bank" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Bank statements
            </Link>
            {!plan.paid && <ReadOnlyPlanBanner feature="Bank statements" />}
            <StatementReconciliation detail={detail} canEdit={canEdit} entryOptions={options} />
        </div>
    )
}
