import { NextResponse } from "next/server";
import { Resend } from "resend";

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    try {
        const { name, email, subject, message } = await request.json();

        // Validation fallback
        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { error: "All fields are required." },
                { status: 400 }
            );
        }

        // Send the email to your personal inbox
        const { data, error } = await resend.emails.send({
            from: "Outlayd Support <onboarding@resend.dev>", // Replace with your verified custom domain later if needed
            to: "ishwardev011@gmail.com",
            replyTo: email, // This lets you hit "Reply" in Gmail to answer the user directly
            subject: `[Outlayd Contact Form] ${subject}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                    <h2 style="color: #4F46E5; border-bottom: 1px solid #f3f4f6; padding-bottom: 10px;">New Contact Form Message</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
                    <p><strong>Message:</strong></p>
                    <p style="white-space: pre-wrap; background-color: #f9fafb; padding: 15px; border-radius: 5px; color: #374151;">${message}</p>
                </div>
            `,
        });

        if (error) {
            return NextResponse.json({ error }, { status: 400 });
        }

        return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || "Something went wrong" },
            { status: 500 }
        );
    }
}
