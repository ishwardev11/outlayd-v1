"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendContactEmail(formData: {
    name: string;
    email: string;
    subject: string;
    message: string;
}) {
    try {
        const { name, email, subject, message } = formData;

        if (!name || !email || !subject || !message) {
            return { success: false, error: "Missing required fields" };
        }

        const { data, error } = await resend.emails.send({
            from: "Outlayd Contact <onboarding@resend.dev>",
            to: "ishwar.k.96@gmail.com", // Free tier account owner email address
            subject: `New Contact Submission: ${subject}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
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
            console.error("Resend delivery error:", error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error: any) {
        console.error("Contact form action error:", error);
        return { success: false, error: error.message || "An unexpected error occurred." };
    }
}
