"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileUp, Target, UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Plus } from "lucide-react"
import { processQuoteUpload, addManualQuote } from "@/app/actions/procurement"
import { EvaluationResults } from "./EvaluationResults"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

export function ProjectDashboard({ project, quotes }: { project: any, quotes: any[] }) {
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isManualModalOpen, setIsManualModalOpen] = useState(false)
    const [isSubmittingManual, setIsSubmittingManual] = useState(false)
    const [manualForm, setManualForm] = useState({ vendor_name: '', total_amount: '', payment_terms: '', notes: '' })

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmittingManual(true)
        try {
            await addManualQuote(project.id, {
                ...manualForm,
                total_amount: parseFloat(manualForm.total_amount)
            })
            setIsManualModalOpen(false)
            setManualForm({ vendor_name: '', total_amount: '', payment_terms: '', notes: '' })
        } catch (error) {
            console.error(error)
            alert("Failed to add manual quote")
        } finally {
            setIsSubmittingManual(false)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const files = Array.from(e.dataTransfer.files)
        if (files.length === 0) return

        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append("file", files[0])
            // Pass the project ID directly
            await processQuoteUpload(project.id, formData)
        } catch (error) {
            console.error("Upload failed", error)
            alert("Failed to upload quote.")
        } finally {
            setIsUploading(false)
        }
    }

    const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append("file", files[0])
            await processQuoteUpload(project.id, formData)
        } catch (error) {
            console.error("Upload failed", error)
            alert("Failed to upload quote.")
        } finally {
            setIsUploading(false)
            // Reset input so the same file can be uploaded again if needed
            e.target.value = ''
        }
    }

    const uploadedQuotes = quotes.filter(q => !q.ai_recommendation_status || q.payment_terms === 'Processing...')
    const evaluatedQuotes = quotes.filter(q => q.ai_recommendation_status && !q.is_awarded) // Include rejected so they don't disappear
    const awardedQuotes = quotes.filter(q => q.is_awarded) // Hypothetical for now

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Target className="w-6 h-6 text-indigo-600 " />
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.title}</h1>
                        <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                            {project.status}
                        </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                        {project.mandatory_requirements?.map((req: string, i: number) => (
                            <Badge key={i} variant="secondary" className="bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 dark:border-slate-700">
                                {req}
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col md:items-end p-4 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-200 dark:border-slate-700 min-w-[200px]">
                    <span className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Budget Ceiling</span>
                    <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                        ${Number(project.budget_ceiling).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                        Due: {new Date(project.required_deadline).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                    </span>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">

                {/* Column 1: Uploaded Bids */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <FileUp className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                            Uploaded Bids
                        </h3>
                        <Badge variant="secondary" className="bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{uploadedQuotes.length}</Badge>
                    </div>

                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`
                            border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all bg-white dark:bg-slate-800 ${isDragging ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/30' : 'border-gray-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'}
                            ${isUploading ? 'opacity-50 pointer-events-none' : ''}
                        `}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-4" />
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Extracting Quote Data...</p>
                            </>
                        ) : (
                            <>
                                <div className="h-12 w-12 rounded-full bg-gray-50 dark:bg-slate-900 flex items-center justify-center mb-4">
                                    <UploadCloud className="h-6 w-6 text-gray-500 dark:text-slate-400" />
                                </div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Drag and drop vendor quotes here</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">PDF, JPG, PNG up to 10MB</p>
                                <label className="cursor-pointer">
                                    <span className="bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:hover:bg-slate-700 px-4 py-2 rounded-md text-sm font-medium inline-block transition-colors">
                                        Browse Files
                                    </span>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="application/pdf,image/*"
                                        onChange={handleFileInput}
                                    />
                                </label>
                            </>
                        )}
                    </div>

                    <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="w-full border-dashed text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-500/50">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Quote Manually
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Add Manual Quote</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleManualSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="vendor_name" className="dark:text-slate-200">Vendor Name</Label>
                                    <Input
                                        id="vendor_name"
                                        value={manualForm.vendor_name}
                                        onChange={(e) => setManualForm(f => ({ ...f, vendor_name: e.target.value }))}
                                        required
                                        placeholder="Acme Corp"
                                        className="dark:bg-slate-900 dark:border-slate-700 dark:text-white placeholder:text-gray-500 dark:placeholder-slate-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="total_amount" className="dark:text-slate-200">Total Amount ($)</Label>
                                    <Input
                                        id="total_amount"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={manualForm.total_amount}
                                        onChange={(e) => setManualForm(f => ({ ...f, total_amount: e.target.value }))}
                                        required
                                        placeholder="5000"
                                        className="dark:bg-slate-900 dark:border-slate-700 dark:text-white placeholder:text-gray-500 dark:placeholder-slate-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="payment_terms" className="dark:text-slate-200">Payment Terms</Label>
                                    <Input
                                        id="payment_terms"
                                        value={manualForm.payment_terms}
                                        onChange={(e) => setManualForm(f => ({ ...f, payment_terms: e.target.value }))}
                                        required
                                        placeholder="Net 30, Due on Receipt, etc."
                                        className="dark:bg-slate-900 dark:border-slate-700 dark:text-white placeholder:text-gray-500 dark:placeholder-slate-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="notes" className="dark:text-slate-200">Notes / Rationale</Label>
                                    <Textarea
                                        id="notes"
                                        value={manualForm.notes}
                                        onChange={(e) => setManualForm(f => ({ ...f, notes: e.target.value }))}
                                        placeholder="Any additional details or reasoning for this quote"
                                        rows={3}
                                        className="dark:bg-slate-900 dark:border-slate-700 dark:text-white placeholder:text-gray-500 dark:placeholder-slate-500"
                                    />
                                </div>
                                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={isSubmittingManual}>
                                    {isSubmittingManual ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    Save Quote
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Pending Quotes List */}
                    <div className="space-y-3">
                        {uploadedQuotes.map(quote => (
                            <Card key={quote.id} className="shadow-sm border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 animate-in fade-in zoom-in duration-300">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gray-50 dark:bg-slate-900/50 rounded-md">
                                            <FileText className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{quote.vendor_name}</p>
                                        </div>
                                    </div>
                                    {quote.payment_terms === 'Processing...' && (
                                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Column 2: AI Evaluation */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <Target className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                            AI Evaluation
                        </h3>
                        <Badge variant="secondary" className="bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{evaluatedQuotes.length}</Badge>
                    </div>

                    <div className="space-y-4">
                        {evaluatedQuotes.map(quote => (
                            <Card key={quote.id} className="shadow-sm border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-colors cursor-pointer">
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white">{quote.vendor_name}</CardTitle>
                                        <Badge variant="outline" className={
                                            quote.ai_recommendation_status === 'Recommended' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' :
                                                quote.ai_recommendation_status === 'Alternative' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' :
                                                    'bg-gray-50 dark:bg-slate-900/50 text-gray-500 dark:text-slate-400 dark:border-slate-700'
                                        }>
                                            {quote.ai_recommendation_status}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-xs font-medium text-gray-900 dark:text-slate-300 mt-1">
                                        ${Number(quote.total_amount).toLocaleString()}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2 mt-2 border-t border-gray-200 dark:border-slate-700 pt-2">
                                        <span className="font-medium text-gray-900 dark:text-white">AI Note:</span> {quote.ai_rationale}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}

                        {evaluatedQuotes.length === 0 && (
                            <div className="p-8 text-center border border-dashed border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-800/50">
                                <p className="text-sm text-gray-500 dark:text-slate-400">Processed bids will appear here</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Column 3: Awarded */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                            Awarded
                        </h3>
                        <Badge variant="secondary" className="bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{awardedQuotes.length}</Badge>
                    </div>

                    <div className="space-y-4">
                        {awardedQuotes.length === 0 && (
                            <div className="p-8 text-center border border-dashed border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-800/50">
                                <p className="text-sm text-gray-500 dark:text-slate-400">No bid awarded yet</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            <EvaluationResults project={project} quotes={quotes} />
        </div>
    )
}
