import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const activeOrgId = typeof document !== 'undefined'
        ? document.cookie
            .split('; ')
            .find((row) => row.trim().startsWith('active_org_id='))
            ?.split('=')[1]
        : undefined;

    const headers: Record<string, string> = {}
    if (activeOrgId) {
        headers['x-active-org-id'] = activeOrgId
    }

    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                headers,
            }
        }
    )
}
