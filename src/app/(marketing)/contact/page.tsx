"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar, Footer } from "../page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, User, MessageSquare, Clock, CheckCircle2, ArrowLeft, Tag } from "lucide-react";
import Link from "next/link";

export default function ContactPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, email, subject, message }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                setIsSubmitted(true);
            } else {
                setError(result.error || "Failed to send message. Please try again.");
            }
        } catch (err: any) {
            setError("An unexpected error occurred. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
            <Navbar />
            <main className="pt-28 pb-32 px-4 relative overflow-hidden flex flex-col justify-center items-center min-h-[calc(100vh-4rem)]">
                {/* Background ambient glows */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="container mx-auto max-w-xl relative z-10 w-full">
                    <AnimatePresence mode="wait">
                        {!isSubmitted ? (
                            <motion.div
                                key="contact-form"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.5 }}
                                className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-md shadow-2xl flex flex-col gap-6"
                            >
                                <div className="space-y-2 text-center">
                                    <h1 className="text-3xl font-bold tracking-tight text-white">Get in touch</h1>
                                    <p className="text-slate-400 text-sm">
                                        Have questions about Outlayd? Send us a message and we will help you out.
                                    </p>
                                </div>

                                {error && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl text-center">
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {/* Name Input */}
                                    <div className="space-y-2">
                                        <Label htmlFor="name" className="text-slate-350 text-xs font-semibold">Your Name</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                                            <Input
                                                id="name"
                                                type="text"
                                                placeholder="John Doe"
                                                className="pl-10 bg-slate-950/50 border-slate-850 text-white placeholder-slate-600 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus:border-indigo-500 text-sm"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>

                                    {/* Email Input */}
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-slate-350 text-xs font-semibold">Email Address</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                                            <Input
                                                id="email"
                                                type="email"
                                                placeholder="john@example.com"
                                                className="pl-10 bg-slate-950/50 border-slate-850 text-white placeholder-slate-600 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus:border-indigo-500 text-sm"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>

                                    {/* Subject Input */}
                                    <div className="space-y-2">
                                        <Label htmlFor="subject" className="text-slate-350 text-xs font-semibold">Subject</Label>
                                        <div className="relative">
                                            <Tag className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                                            <Input
                                                id="subject"
                                                type="text"
                                                placeholder="What is this regarding?"
                                                className="pl-10 bg-slate-950/50 border-slate-850 text-white placeholder-slate-600 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus:border-indigo-500 text-sm"
                                                value={subject}
                                                onChange={(e) => setSubject(e.target.value)}
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>

                                    {/* Message Input */}
                                    <div className="space-y-2">
                                        <Label htmlFor="message" className="text-slate-350 text-xs font-semibold">Your Message</Label>
                                        <div className="relative">
                                            <MessageSquare className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                                            <Textarea
                                                id="message"
                                                placeholder="How can we help your business?"
                                                rows={4}
                                                className="pl-10 pt-2.5 bg-slate-950/50 border-slate-850 text-white placeholder-slate-600 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus:border-indigo-500 text-sm min-h-[100px]"
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>

                                    {/* Disclaimer Info Box */}
                                    <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl text-amber-200/90 text-xs leading-relaxed flex items-start gap-3 mt-4">
                                        <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                                        <div className="space-y-1">
                                            <p className="font-semibold text-amber-300">Lean Support Disclaimer</p>
                                            <p className="text-slate-400">
                                                Outlayd is managed by a lean team of founders. We read and respond to every single query carefully, but please allow <strong className="font-semibold text-amber-300">24 to 48 hours</strong> for us to get back to you. We appreciate your patience!
                                            </p>
                                        </div>
                                    </div>

                                    {/* Submit Button */}
                                    <Button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-[0_0_30px_-5px_rgba(79,70,229,0.4)] active:scale-[0.98] mt-6 flex items-center justify-center cursor-pointer"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                Sending message...
                                            </>
                                        ) : (
                                            "Send Message"
                                        )}
                                    </Button>
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="success-screen"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.4 }}
                                className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-md shadow-2xl flex flex-col items-center text-center gap-6"
                            >
                                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center animate-bounce">
                                    <CheckCircle2 className="w-10 h-10" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-bold text-white">Message sent successfully!</h2>
                                    <p className="text-slate-400 text-sm max-w-sm">
                                        Thank you for reaching out, {name}. We have received your message and our founders will review it shortly.
                                    </p>
                                </div>
                                <div className="p-4 bg-slate-950/40 border border-slate-850/80 rounded-2xl text-xs text-slate-400 max-w-sm">
                                    We will reply to <span className="text-white font-medium">{email}</span> within the next 24 to 48 hours.
                                </div>
                                <Link href="/" className="mt-4">
                                    <Button variant="outline" className="border-slate-800 hover:bg-slate-800/50 text-slate-300 hover:text-white px-6 rounded-xl flex items-center gap-2 cursor-pointer">
                                        <ArrowLeft className="w-4 h-4" />
                                        Back to Home
                                    </Button>
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
            <Footer />
        </div>
    );
}
