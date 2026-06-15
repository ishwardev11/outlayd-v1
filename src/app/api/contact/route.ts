import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, subject, message } = body;

        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        const { data, error } = await resend.emails.send({
            from: "Outlayd Contact <onboarding@resend.dev>",
            to: "ishwar.k.96@gmail.com",
            subject: `New Contact Submission: ${subject}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #4f46e5; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">New Contact Message</h2>
                    <p style="margin: 10px 0;"><strong>Name:</strong> ${name}</p>
                    <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
                    <p style="margin: 10px 0;"><strong>Subject:</strong> ${subject}</p>
                    <div style="margin-top: 20px; padding: 15px; background-color: #f8fafc; border-radius: 6px; border-left: 4px solid #4f46e5;">
                        <p style="margin: 0; font-weight: bold; margin-bottom: 5px;">Message:</p>
                        <p style="margin: 0; white-space: pre-wrap; color: #334155; line-height: 1.5;">${message}</p>
                    </div>
                </div>
            `,
        });

        if (error) {
            console.error("Resend API Route error:", error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error("Contact API Route unexpected error:", error);
        return NextResponse.json(
            { success: false, error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}
