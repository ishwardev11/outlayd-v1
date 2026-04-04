export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getOrganizationId } from '@/app/actions/document-utils';

export async function POST(req: Request) {
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string || 'sk_test_dummy', {
            apiVersion: '2026-02-25.clover',
        });

        const body = await req.json();

        // We accept the orgId from the frontend if they passed it
        let { orgId } = body;

        // As a fallback, try to get it from the server session
        if (!orgId) {
            orgId = await getOrganizationId();
        }

        if (!orgId) {
            return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
        }

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
            success_url: `${req.headers.get('origin')}/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.get('origin')}/dashboard`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error('Stripe checkout error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
