"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, CheckCircle2 } from "lucide-react"
import jsPDF from "jspdf"
import { useCurrency } from "@/components/CurrencyProvider"

export function EvaluationResults({ project, quotes }: { project: any, quotes: any[] }) {
    const { symbol } = useCurrency();
    // Only show evaluated quotes
    const evaluatedQuotes = quotes.filter(q => q.ai_recommendation_status)

    if (evaluatedQuotes.length === 0) {
        return null;
    }

    const generateAuditMemo = () => {
        const doc = new jsPDF()

        // Header
        doc.setFontSize(22)
        doc.setFont("helvetica", "bold")
        doc.text("Procurement Audit Memo", 20, 20)

        // Project Info
        doc.setFontSize(14)
        doc.text(`Project: ${project.title}`, 20, 35)
        doc.setFontSize(11)
        doc.setFont("helvetica", "normal")
        doc.text(`Budget Ceiling: ${symbol}${Number(project.budget_ceiling).toLocaleString()}`, 20, 43)
        doc.text(`Required Deadline: ${new Date(project.required_deadline).toLocaleDateString()}`, 20, 50)

        let yPos = 65

        // Quotes
        evaluatedQuotes.forEach((quote, index) => {
            if (yPos > 250) {
                doc.addPage()
                yPos = 20
            }

            doc.setFontSize(14)
            doc.setFont("helvetica", "bold")
            doc.text(`${index + 1}. Vendor: ${quote.vendor_name}`, 20, yPos)
            yPos += 8

            doc.setFontSize(11)
            doc.setFont("helvetica", "normal")
            doc.text(`Total Amount: ${symbol}${Number(quote.total_amount).toLocaleString()}`, 25, yPos)
            yPos += 7
            doc.text(`Payment Terms: ${quote.payment_terms}`, 25, yPos)
            yPos += 7
            doc.text(`Recommendation: ${quote.ai_recommendation_status}`, 25, yPos)
            yPos += 7

            doc.setFont("helvetica", "italic")
            // Handle long rationale text wrapping
            const splitRationale = doc.splitTextToSize(`Rationale: ${quote.ai_rationale}`, 160)
            doc.text(splitRationale, 25, yPos)
            yPos += (splitRationale.length * 6) + 10
        })

        doc.save(`Audit_Memo_${project.title.replace(/\s+/g, '_')}.pdf`)
    }

    return (
        <Card className="mt-8 shadow-sm border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardHeader className="bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800 flex flex-row items-center justify-between py-4">
                <div>
                    <CardTitle className="text-xl text-gray-900 dark:text-white">Evaluation Results Matrix</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">Side-by-side comparison of evaluated vendor bids</CardDescription>
                </div>
                <Button
                    variant="outline"
                    onClick={generateAuditMemo}
                    className="flex items-center gap-2 border-slate-300 dark:border-slate-700 text-gray-900 dark:text-slate-200 bg-transparent dark:hover:bg-slate-800"
                >
                    <Download className="w-4 h-4" />
                    Generate Audit Memo
                </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-500 dark:text-slate-400">
                    <thead className="bg-gray-50 dark:bg-slate-800/80 border-b border-gray-200 dark:border-slate-800 text-gray-900 dark:text-slate-200">
                        <tr>
                            <th className="p-4 font-semibold w-48 border-r border-gray-200 dark:border-slate-800">Constraint</th>
                            {evaluatedQuotes.map(quote => (
                                <th key={quote.id} className={`p-4 font-semibold min-w-62.5 ${quote.ai_recommendation_status === 'Recommended' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        {quote.vendor_name}
                                        {quote.ai_recommendation_status === 'Recommended' && (
                                            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        <tr>
                            <td className="p-4 font-medium border-r border-gray-200 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/30">Total Amount</td>
                            {evaluatedQuotes.map(quote => (
                                <td key={`amount-${quote.id}`} className={`p-4 font-medium ${quote.ai_recommendation_status === 'Recommended' ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}>
                                    <span className={Number(quote.total_amount) > Number(project.budget_ceiling) ? 'text-red-500 dark:text-red-400 font-bold' : ''}>
                                        {symbol}{Number(quote.total_amount).toLocaleString()}
                                    </span>
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 font-medium border-r border-gray-200 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/30">Payment Terms</td>
                            {evaluatedQuotes.map(quote => (
                                <td key={`terms-${quote.id}`} className={`p-4 ${quote.ai_recommendation_status === 'Recommended' ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}>
                                    {quote.payment_terms}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 font-medium border-r border-gray-200 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/30">AI Recommendation</td>
                            {evaluatedQuotes.map(quote => (
                                <td key={`rec-${quote.id}`} className={`p-4 ${quote.ai_recommendation_status === 'Recommended' ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}>
                                    <Badge variant="outline" className={
                                        quote.ai_recommendation_status === 'Recommended' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/30' :
                                            quote.ai_recommendation_status === 'Alternative' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' :
                                                'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20'
                                    }>
                                        {quote.ai_recommendation_status}
                                    </Badge>
                                </td>
                            ))}
                        </tr>
                        {/* Rationale row */}
                        <tr>
                            <td className="p-4 font-medium border-r border-gray-200 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/30 align-top">AI Rationale</td>
                            {evaluatedQuotes.map(quote => (
                                <td key={`rationale-${quote.id}`} className={`p-4 text-xs leading-relaxed text-gray-500 dark:text-slate-400 align-top ${quote.ai_recommendation_status === 'Recommended' ? 'bg-indigo-50/30 dark:bg-indigo-500/5 border-b-2 border-indigo-500 dark:border-indigo-400' : ''}`}>
                                    {quote.ai_rationale}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </CardContent>
        </Card>
    )
}
