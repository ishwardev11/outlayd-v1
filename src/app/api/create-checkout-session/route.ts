export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getOrganizationId } from '@/app/actions/document-utils';

export async function POST(req: Request) {
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2026-02-25.clover',
        });

        const body = await req.json();

        // Prioritize server-side lookup for security (prevents IDOR)
        const authenticatedOrgId = await getOrganizationId();
        
        // If an orgId was passed in the body, verify it matches the user's secret session
        const bodyOrgId = body.orgId;
        
        if (bodyOrgId && authenticatedOrgId && bodyOrgId !== authenticatedOrgId) {
             return NextResponse.json({ error: 'Unauthorized organization access' }, { status: 403 });
        }

        const orgId = authenticatedOrgId || bodyOrgId;

        if (!orgId) {
            return NextResponse.json({ error: 'Organization ID is required. Please log in.' }, { status: 401 });
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: 'price_1TErcuAoi98hcDUgCdxGVFX3', // SpendSync AI Pro recurring price
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            metadata: {
                organization_id: orgId,
            },
            subscription_data: {
                metadata: {
                    organization_id: orgId,
                },
            },
            success_url: `${baseUrl}/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/dashboard`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error('Stripe checkout error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
