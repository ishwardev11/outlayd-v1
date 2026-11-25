import { redirect } from "next/navigation";

// Moved to Settings, Assets & Loans (simplification step 6). next.config.ts redirects /assets
// permanently; this file is only a fallback and is removed in step 9.
export default function OldAssetsPage() {
    redirect("/settings?tab=assets");
}
