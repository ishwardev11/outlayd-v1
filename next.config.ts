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
    ];
  },
};

export default nextConfig;
