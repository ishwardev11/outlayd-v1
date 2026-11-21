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
};

export default nextConfig;
