import { redirect } from "next/navigation"

// Moved to /bank (simplification step 3). next.config.ts redirects this address permanently, keeping
// the query string; this file is only a fallback and is removed in step 9.
export default function OldBankStatementsPage() {
    redirect("/bank")
}
