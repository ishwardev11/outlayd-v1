import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createHash } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";

const MAX_BODY_BYTES = 20_000;
const LIMITS = { name: 100, email: 254, subject: 150, message: 5000 };
const MAX_PER_IP_PER_HOUR = 5;
const MAX_TOTAL_PER_HOUR = 100;
const EMAIL_RE = /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[^\s@<>"',;:()\[\]\\]+$/;

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Names, emails and subjects must never contain line breaks (header injection)
function singleLine(value: string) {
    return value.replace(/[\r\n\t]+/g, " ").trim();
}

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
    try {
        // Only accept submissions that come from this site's own pages
        const origin = request.headers.get("origin");
        if (origin) {
            const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
            try {
                if (new URL(origin).host !== host) return fail("Forbidden", 403);
            } catch {
                return fail("Forbidden", 403);
            }
        }

        const declaredLength = Number(request.headers.get("content-length") || 0);
        if (declaredLength > MAX_BODY_BYTES) return fail("Message is too large.", 413);

        let body: Record<string, unknown>;
        try {
            const raw = await request.text();
            if (raw.length > MAX_BODY_BYTES) return fail("Message is too large.", 413);
            body = JSON.parse(raw);
        } catch {
            return fail("Invalid request.", 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request.", 400);

        // Honeypot: real visitors never see or fill this field, bots usually do.
        // Pretend it worked so the bot learns nothing.
        if (typeof body.website === "string" && body.website.trim() !== "") {
            return NextResponse.json({ success: true }, { status: 200 });
        }

        if (
            typeof body.name !== "string" || typeof body.email !== "string" ||
            typeof body.subject !== "string" || typeof body.message !== "string"
        ) {
            return fail("All fields are required.", 400);
        }

        const name = singleLine(body.name);
        const email = singleLine(body.email);
        const subject = singleLine(body.subject);
        const message = body.message.trim();

        if (!name || !email || !subject || !message) return fail("All fields are required.", 400);
        if (
            name.length > LIMITS.name || email.length > LIMITS.email ||
            subject.length > LIMITS.subject || message.length > LIMITS.message
        ) {
            return fail("One of the fields is too long.", 400);
        }
        if (!EMAIL_RE.test(email)) return fail("Please enter a valid email address.", 400);

        const toEmail = process.env.CONTACT_TO_EMAIL;
        if (!process.env.RESEND_API_KEY || !toEmail) {
            console.error("Contact form is missing RESEND_API_KEY or CONTACT_TO_EMAIL");
            return fail("Could not send your message right now. Please try again later.", 500);
        }

        // Rate limit by hashed IP (we never store the raw address)
        const forwarded = request.headers.get("x-forwarded-for") || "";
        const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
        const ipHash = createHash("sha256")
            .update(`${process.env.CONTACT_IP_SALT || ""}:${ip}`)
            .digest("hex");

        const supabase = createAdminClient();
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const [perIp, total] = await Promise.all([
            supabase.from("contact_submissions").select("id", { count: "exact", head: true })
                .eq("ip_hash", ipHash).gte("created_at", since),
            supabase.from("contact_submissions").select("id", { count: "exact", head: true })
                .gte("created_at", since),
        ]);
        if (perIp.error || total.error) {
            console.error("Contact rate-limit lookup failed:", perIp.error || total.error);
            return fail("Could not send your message right now. Please try again later.", 503);
        }
        if ((perIp.count ?? 0) >= MAX_PER_IP_PER_HOUR || (total.count ?? 0) >= MAX_TOTAL_PER_HOUR) {
            return fail("Too many messages. Please try again later.", 429);
        }

        const { error: logError } = await supabase.from("contact_submissions").insert({ ip_hash: ipHash });
        if (logError) {
            console.error("Contact rate-limit insert failed:", logError);
            return fail("Could not send your message right now. Please try again later.", 503);
        }
        // Housekeeping: drop entries older than two days
        await supabase.from("contact_submissions").delete()
            .lt("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

        const resend = new Resend(process.env.RESEND_API_KEY);
        const { error } = await resend.emails.send({
            from: "Outlayd Support <onboarding@resend.dev>", // Replace with your verified custom domain later if needed
            to: toEmail,
            replyTo: email,
            subject: `[Outlayd Contact Form] ${subject}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                    <h2 style="color: #4F46E5; border-bottom: 1px solid #f3f4f6; padding-bottom: 10px;">New Contact Form Message</h2>
                    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
                    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
                    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
                    <p><strong>Message:</strong></p>
                    <p style="white-space: pre-wrap; background-color: #f9fafb; padding: 15px; border-radius: 5px; color: #374151;">${escapeHtml(message)}</p>
                </div>
            `,
        });

        if (error) {
            console.error("Resend failed to send the contact email:", error);
            return fail("Could not send your message right now. Please try again later.", 502);
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
        console.error("Contact form error:", err);
        return fail("Something went wrong. Please try again later.", 500);
    }
}
