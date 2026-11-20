import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getOrganizationCurrency } from "@/app/actions/document-utils"
import { buildExport, parseExportParams, toGenericCsv } from "@/utils/accounting-export"
import { featureAllowed, planGateMessage } from "@/utils/plan"
import { EXPORT_MAX_DOCUMENTS, loadExportData } from "@/utils/accounting-export-data"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/accounting-export?[format=generic&]from=YYYY-MM-DD&to=YYYY-MM-DD
//     &scope=paid|approved&dateField=document_date|paid_date[&preview=1]
// Without preview it downloads the CSV; with preview=1 it returns counts and warnings as JSON.
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = parseExportParams(request.nextUrl.searchParams)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const params = parsed.value

    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "No active organization" }, { status: 403 })

    // Paid plans, and organisations that have been on one (an export of existing data). The page shows
    // a locked screen, and this stops a direct call to the endpoint.
    if (!(await featureAllowed(supabase, organizationId, "accounting_export", "read"))) {
        return NextResponse.json(
            { error: planGateMessage("accounting_export", "read"), upgradeRequired: true },
            { status: 403 }
        )
    }

    try {
        const [loaded, currency] = await Promise.all([
            loadExportData(supabase, organizationId, params),
            getOrganizationCurrency(),
        ])
        if ("tooMany" in loaded) {
            return NextResponse.json(
                { error: `That range has more than ${EXPORT_MAX_DOCUMENTS.toLocaleString()} documents. Choose a shorter date range.` },
                { status: 422 }
            )
        }

        const { lines, summary } = buildExport(loaded.docs, loaded.lookups)

        if (request.nextUrl.searchParams.get("preview") === "1") {
            return NextResponse.json({ ...summary, currency }, { headers: { "Cache-Control": "no-store" } })
        }

        const csv = toGenericCsv(lines, currency)
        const name = `outlayd-accounting-${params.from}-to-${params.to}.csv`
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${name}"`,
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        console.error("Accounting export failed:", error)
        return NextResponse.json({ error: "Could not build the export. Please try again." }, { status: 500 })
    }
}
