import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Uploads (documents, money-in attachments, letterheads) go through server actions, and the
      // app allows files up to 10 MB. Next.js rejects anything over 1 MB by default, so allow
      // 10 MB plus room for the form data around the file. Each action still checks its own limit.
      bodySizeLimit: "11mb",
    },
  },
  // Pages that moved (simplification plan). Permanent (308), and any query string is passed on, so old
  // bookmarks, emails and links keep working; e.g. /reconciliations?month=2026-10-31 lands on
  // /bank?tab=reconciliation&month=2026-10-31.
  async redirects() {
    return [
      { source: "/bank-statements", destination: "/bank", permanent: true },
      { source: "/bank-statements/:id", destination: "/bank/:id", permanent: true },
      { source: "/reconciliations", destination: "/bank?tab=reconciliation", permanent: true },
      // Step 4: the Ledger was split. The first rule that matches wins, so the plain /ledger comes last.
      { source: "/ledger", has: [{ type: "query", key: "view", value: "cash" }], destination: "/transactions", permanent: true },
      { source: "/ledger", has: [{ type: "query", key: "status", value: "needs_review" }], destination: "/inbox", permanent: true },
      { source: "/ledger", has: [{ type: "query", key: "status", value: "awaiting_payment" }], destination: "/invoices?status=unpaid", permanent: true },
      { source: "/ledger", has: [{ type: "query", key: "status", value: "paid" }], destination: "/transactions?type=money_out", permanent: true },
      { source: "/ledger", destination: "/inbox", permanent: true },
      // Step 5: the lock, lock history and statement line moved from Settings > Year end to the Year end hub
      { source: "/settings", has: [{ type: "query", key: "tab", value: "year-end" }], destination: "/reports/year-end", permanent: true },
      // Step 6: Assets & Loans is a Settings tab; the General tab is gone (its login email is in the
      // profile menu, which opens its Account window for ?account=1). The destination must replace
      // tab=general, or the passed-on query would match this rule again and loop forever.
      { source: "/assets", destination: "/settings?tab=assets", permanent: true },
      { source: "/settings", has: [{ type: "query", key: "tab", value: "general" }], destination: "/settings?tab=organization&account=1", permanent: true },
      // Step 8: the list of everyone money comes from or goes to is Contacts (it was Vendors, then Payees)
      { source: "/vendors", destination: "/contacts", permanent: true },
      { source: "/vendors/:path*", destination: "/contacts/:path*", permanent: true },
      { source: "/payees", destination: "/contacts", permanent: true },
      { source: "/payees/:path*", destination: "/contacts/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
