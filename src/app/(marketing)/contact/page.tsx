"use client";

// Contact form, in the light look of the landing page. A ?subject= in the link fills in the subject
// (the nonprofit pricing and "Talk to the founder" buttons use it). Sends to /api/contact.
import { useState, useEffect } from "react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site";
import { Loader2, Clock, CheckCircle2, ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { errorMessage as messageOf } from "@/utils/row-types";

const field = "block w-full rounded-[14px] border border-black/[0.12] bg-white px-3.5 text-[16px] text-neutral-900 placeholder:text-neutral-400 shadow-[0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-colors focus:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600/20 disabled:opacity-60 sm:text-[14px]";
const label = "mb-1.5 block text-[13px] font-medium text-neutral-800";

export default function ContactPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [website, setWebsite] = useState(""); // honeypot: real visitors never see this field
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const sub = params.get("subject");
            if (sub) {
                // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable in the browser; reading it during render would not match the prerendered page
                setSubject(sub);
            }
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMessage("");

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, email, subject, message, website }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to send message. Please try again.");
            }

            setIsSubmitted(true);
        } catch (error) {
            setErrorMessage(messageOf(error) || "An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mk min-h-screen">
            <SiteHeader />
            <main className="px-6 pb-[120px] pt-[136px]">
                <div className="mx-auto w-full max-w-xl">
                    {!isSubmitted ? (
                        <div className="mk-rise rounded-3xl border border-black/[0.08] bg-white p-6 sm:p-8">
                            <h1 className="mk-display m-0 text-[34px] leading-[1.1]">Get in touch</h1>
                            <p className="mt-2 text-[15px] text-neutral-600">
                                Questions about Outlayd, pricing or the nonprofit discount? Send us a message.
                            </p>

                            {errorMessage && (
                                <div role="alert" className="mt-6 flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
                                    <AlertCircle className="h-5 w-5 shrink-0 text-red-600" strokeWidth={1.75} aria-hidden="true" />
                                    <p className="m-0">{errorMessage}</p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                                {/* Honeypot field: hidden from people, bots tend to fill it in */}
                                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, overflow: "hidden" }}>
                                    <label htmlFor="website">Website</label>
                                    <input
                                        id="website"
                                        name="website"
                                        type="text"
                                        tabIndex={-1}
                                        autoComplete="off"
                                        value={website}
                                        onChange={(e) => setWebsite(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label htmlFor="name" className={label}>Your name</label>
                                    <input id="name" type="text" autoComplete="name" className={`${field} h-11`} value={name} onChange={(e) => setName(e.target.value)} required disabled={isLoading} />
                                </div>
                                <div>
                                    <label htmlFor="email" className={label}>Email address</label>
                                    <input id="email" type="email" autoComplete="email" className={`${field} h-11`} value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
                                </div>
                                <div>
                                    <label htmlFor="subject" className={label}>Subject</label>
                                    <input id="subject" type="text" className={`${field} h-11`} value={subject} onChange={(e) => setSubject(e.target.value)} required disabled={isLoading} />
                                </div>
                                <div>
                                    <label htmlFor="message" className={label}>Your message</label>
                                    <textarea id="message" rows={5} className={`${field} min-h-32 py-2.5`} value={message} onChange={(e) => setMessage(e.target.value)} required disabled={isLoading} />
                                </div>

                                <div className="flex items-start gap-3 rounded-2xl bg-neutral-100 p-4 text-[13px] leading-relaxed text-neutral-700">
                                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" strokeWidth={1.75} aria-hidden="true" />
                                    <p className="m-0">
                                        Outlayd is run by a small founding team. We read and answer every message, so please allow
                                        <span className="font-medium text-neutral-900"> 24 to 48 hours</span> for a reply.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-brand-600 text-[15px] font-medium text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isLoading ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Sending message</>) : "Send message"}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div role="status" className="mk-rise flex flex-col items-center gap-5 rounded-3xl border border-black/[0.08] bg-white p-8 text-center">
                            <CheckCircle2 className="h-10 w-10 text-green-700" strokeWidth={1.75} aria-hidden="true" />
                            <div>
                                <h2 className="mk-display m-0 text-[28px] leading-tight">Message sent</h2>
                                <p className="mx-auto mt-2 max-w-sm text-[15px] text-neutral-600">
                                    Thank you, {name}. We will reply to <span className="font-medium text-neutral-900">{email}</span> within 24 to 48 hours.
                                </p>
                            </div>
                            <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-white px-5 text-[15px] font-medium text-neutral-900 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] transition-colors hover:bg-neutral-100">
                                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                                Back to home
                            </Link>
                        </div>
                    )}
                </div>
            </main>
            <SiteFooter />
        </div>
    );
}
