"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileUp, Target, UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, Edit, Sparkles, Trophy, BrainCircuit, ChevronRight, Eye } from "lucide-react"
import { processQuoteUpload, addManualQuote, evaluateQuotes, deleteQuote, editQuote } from "@/app/actions/procurement"
import { EvaluationResults } from "./EvaluationResults"
import { QuoteDetailDialog } from "./QuoteDetailDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog"
import { createClient } from "@/utils/supabase/client"
import { runSingleEvaluation } from "@/app/actions/procurement"
import { useRole } from "@/components/RoleProvider"
import { useCurrency } from "@/components/CurrencyProvider"

export type BidStatus = 'uploaded' | 'evaluating' | 'evaluated' | 'awarded' | 'rejected'

export interface Bid {
    id: string
    vendorName: string
    fileSize: string
    date: string
    status: BidStatus
    // Preserved server data for AI evaluation column & actions
    totalAmount: number
    paymentTerms: string
    aiRecommendationStatus: string | null
    aiRationale: string | null
    extractedData: any
    notes: string | null
    fileUrl: string | null
    isRecommended: boolean | null
    /** Keep the original server object for passing to EvaluationResults */
    _raw: any
}

function deriveBidStatus(q: any): BidStatus {
    if (q.status) return q.status as BidStatus
    if (q.is_awarded) return 'awarded'
    if (q.ai_recommendation_status && q.payment_terms !== 'Processing...') return 'evaluated'
    if (q.payment_terms === 'Processing...') return 'evaluating'
    return 'uploaded'
}

function quoteToBid(q: any): Bid {
    return {
        id: q.id,
        vendorName: q.vendor_name || 'Unknown Vendor',
        fileSize: q.file_size || '—',
        date: q.created_at ? new Date(q.created_at).toLocaleDateString('en-GB') : 'Just now',
        status: deriveBidStatus(q),
        totalAmount: Number(q.total_amount) || 0,
        paymentTerms: q.payment_terms || '',
        aiRecommendationStatus: q.ai_recommendation_status || null,
        aiRationale: q.ai_rationale || null,
        extractedData: q.extracted_data || null,
        notes: q.notes || null,
        fileUrl: q.file_url || null,
        isRecommended: q.is_recommended || null,
        _raw: q,
    }
}

export function ProjectDashboard({ project, quotes }: { project: any, quotes: any[] }) {
    const supabase = createClient()
    const { isViewer } = useRole()
    const { symbol } = useCurrency()
    // ── Project state ──
    const [projectStatus, setProjectStatus] = useState(project.status)

    // ── Core bids state ──
    const [bids, setBids] = useState<Bid[]>(() => quotes.map(quoteToBid))

    // Sync when server props change (e.g. after revalidatePath)
    useEffect(() => {
        setBids(quotes.map(quoteToBid))
    }, [quotes])

    // Derived columns
    const uploadedBids  = useMemo(() => bids.filter(b => b.status === 'uploaded' || b.status === 'evaluating'), [bids])
    const evaluatedBids = useMemo(() => bids.filter(b => b.status === 'evaluated' || b.status === 'rejected'), [bids])
    const awardedBids   = useMemo(() => bids.filter(b => b.status === 'awarded'), [bids])

    // ── UI state ──
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isManualModalOpen, setIsManualModalOpen] = useState(false)
    const [isSubmittingManual, setIsSubmittingManual] = useState(false)
    const [isEvaluatingAll, setIsEvaluatingAll] = useState(false)
    const [manualForm, setManualForm] = useState({ vendor_name: '', total_amount: '', payment_terms: '', notes: '' })

    // Delete confirmation state
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, name: string } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Edit modal state
    const [editTarget, setEditTarget] = useState<Bid | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({ vendor_name: '', total_amount: '', payment_terms: '' })

    // Per-bid evaluation state
    const [evaluatingBidId, setEvaluatingBidId] = useState<string | null>(null)
    const [isAwardingId, setIsAwardingId] = useState<string | null>(null)

    // ── Mock bid helper for testing (Retained but not used for primary flow) ──
    const MOCK_VENDORS = ['TechCorp', 'FreshFoods', 'AmCorp', 'GlobalSupply', 'PrimeParts', 'NexGen Solutions', 'ClearPath Inc', 'Summit Logistics', 'BlueWave Systems', 'Apex Materials']
    const MOCK_FILE_SIZES = ['1.2 MB', '2.4 MB', '3.7 MB', '856 KB', '4.1 MB', '1.8 MB', '5.2 MB']

    const createMockBid = (vendorName?: string): Bid => ({
        id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        vendorName: vendorName || MOCK_VENDORS[Math.floor(Math.random() * MOCK_VENDORS.length)],
        fileSize: MOCK_FILE_SIZES[Math.floor(Math.random() * MOCK_FILE_SIZES.length)],
        date: new Date().toLocaleDateString('en-GB'),
        status: 'uploaded',
        totalAmount: Math.floor(Math.random() * 9000 + 1000),
        paymentTerms: ['Net 30', 'Net 60', 'Due on Receipt'][Math.floor(Math.random() * 3)],
        aiRecommendationStatus: null,
        aiRationale: null,
        extractedData: null,
        notes: null,
        fileUrl: null,
        isRecommended: null,
        _raw: {},
    })

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmittingManual(true)
        try {
            const { data, error } = await supabase
                .from('quotes')
                .insert({
                    project_id: project.id,
                    organization_id: project.organization_id,
                    vendor_name: manualForm.vendor_name,
                    total_amount: parseFloat(manualForm.total_amount),
                    payment_terms: manualForm.payment_terms,
                    notes: manualForm.notes,
                    status: 'uploaded'
                })
                .select()
                .single()
            
            if (error) throw error
            setBids(prev => [...prev, quoteToBid(data)])
            setIsManualModalOpen(false)
            setManualForm({ vendor_name: '', total_amount: '', payment_terms: '', notes: '' })
        } catch (error) {
            console.error(error)
            alert("Failed to add manual quote")
        } finally {
            setIsSubmittingManual(false)
        }
    }

    const handleAwardBid = async (bid: Bid) => {
        setIsAwardingId(bid.id)
        const previousProjectStatus = projectStatus
        const previousBids = bids
        
        // 1. Optimistic Update
        setProjectStatus('Awarded')
        setBids(prev => prev.map(b => {
            if (b.id === bid.id) return { ...b, status: 'awarded' as BidStatus }
            if (['uploaded', 'evaluating', 'evaluated'].includes(b.status)) {
                return { ...b, status: 'rejected' as BidStatus }
            }
            return b
        }))

        try {
            // Import the server action dynamically to ensure it's available
            const { awardBid } = await import("@/app/actions/procurement")
            await awardBid(bid.id, project.id)
        } catch (error) {
            console.error(error)
            alert("Failed to award bid")
            // Rollback
            setProjectStatus(previousProjectStatus)
            setBids(previousBids)
        } finally {
            setIsAwardingId(null)
        }
    }

    const handleRunEvaluation = async (bid: Bid) => {
        setEvaluatingBidId(bid.id)
        // Optimistically update status to 'evaluating'
        setBids(prev => prev.map(b => b.id === bid.id ? { ...b, status: 'evaluating' as BidStatus } : b))
        
        try {
            await runSingleEvaluation(bid.id, project.id)
            setBids(prev => prev.map(b => b.id === bid.id ? { ...b, status: 'evaluated' as BidStatus } : b))
        } catch (error) {
            console.error(error)
            alert("Failed to evaluate bid")
            setBids(prev => prev.map(b => b.id === bid.id ? { ...b, status: 'uploaded' as BidStatus } : b))
        } finally {
            setEvaluatingBidId(null)
        }
    }

    const handleEvaluateAll = async () => {
        const hasUploaded = bids.some(b => b.status === 'uploaded')
        if (!hasUploaded) return

        setIsEvaluatingAll(true)
        try {
            await evaluateQuotes(project.id)
            // The server action handles revalidation, so the quotes prop will update,
            // which triggers the useEffect to update the bids state.
            // But we can do an optimistic update just to show instant feedback:
            setBids(prev => prev.map(b => 
                b.status === 'uploaded' ? { ...b, status: 'evaluating' as BidStatus } : b
            ))
        } catch (error) {
            console.error(error)
            alert("Failed to evaluate all bids")
        } finally {
            setIsEvaluatingAll(false)
        }
    }

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return
        setIsDeleting(true)
        // Optimistic: remove from state
        const prevBids = bids
        setBids(prev => prev.filter(b => b.id !== deleteTarget.id))
        try {
            await deleteQuote(deleteTarget.id, project.id)
        } catch (error) {
            console.error(error)
            setBids(prevBids) // Rollback
            alert("Failed to delete quote.")
        } finally {
            setIsDeleting(false)
            setDeleteTarget(null)
        }
    }

    const openEditModal = (bid: Bid) => {
        setEditForm({
            vendor_name: bid.vendorName || '',
            total_amount: String(bid.totalAmount || ''),
            payment_terms: bid.paymentTerms || ''
        })
        setEditTarget(bid)
    }

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editTarget) return
        setIsEditing(true)
        try {
            await editQuote(editTarget.id, project.id, {
                vendor_name: editForm.vendor_name,
                total_amount: parseFloat(editForm.total_amount as any),
                payment_terms: editForm.payment_terms
            })
            // Optimistic update in state
            setBids(prev => prev.map(b => b.id === editTarget.id ? {
                ...b,
                vendorName: editForm.vendor_name,
                totalAmount: parseFloat(editForm.total_amount as any),
                paymentTerms: editForm.payment_terms,
            } : b))
            setEditTarget(null)
        } catch (error) {
            console.error(error)
            alert("Failed to update quote.")
        } finally {
            setIsEditing(false)
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

    const onUpload = async (file: File) => {
        setIsUploading(true)
        try {
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
            const fileName = `${Date.now()}-${safeName}`
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(fileName, file)
            
            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('receipts')
                .getPublicUrl(fileName)

            const { data: quoteData, error: quoteError } = await supabase
                .from('quotes')
                .insert({
                    project_id: project.id,
                    organization_id: project.organization_id,
                    vendor_name: 'Pending...',
                    total_amount: 0,
                    file_url: publicUrl,
                    file_size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                    status: 'uploaded'
                })
                .select()
                .single()
            
            if (quoteError) throw quoteError

            // Optimistically add the pending bid
            setBids(prev => [...prev, quoteToBid(quoteData)])

            // Extract data using AI
            try {
                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.readAsDataURL(file)
                    reader.onload = () => resolve((reader.result as string).split(',')[1])
                    reader.onerror = error => reject(error)
                })

                const { extractQuoteData } = await import("@/app/actions/procurement")
                const extractedData = await extractQuoteData(quoteData.id, project.id, file.type, base64Data)

                // Update the local state with the extracted data
                setBids(prev => prev.map(b => 
                    b.id === quoteData.id 
                        ? { 
                            ...b, 
                            vendorName: extractedData.vendor_name,
                            totalAmount: extractedData.total_amount,
                            paymentTerms: extractedData.payment_terms,
                            aiRecommendationStatus: extractedData.ai_recommendation_status,
                            aiRationale: extractedData.ai_rationale,
                            extractedData: extractedData.extracted_data
                          } 
                        : b
                ))
            } catch (extractionError) {
                console.error("AI Extraction failed:", extractionError)
                // Continue even if extraction fails, as the file is already uploaded
            }
        } catch (error) {
            console.error(error)
            alert("Upload failed")
        } finally {
            setIsUploading(false)
        }
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
            await onUpload(files[0])
        }
    }

    const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (files && files.length > 0) {
            await onUpload(files[0])
            e.target.value = ''
        }
    }



    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Target className="w-6 h-6 text-primary" />
                        <h1 className="text-2xl font-bold text-foreground">{project.title}</h1>
                        <Badge 
                            variant="outline" 
                            className={`
                                ${projectStatus === 'Awarded' 
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                                    : 'bg-primary/5 text-primary border-primary/20'}
                            `}
                        >
                            {projectStatus}
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

                <div className="flex flex-col md:items-end p-4 bg-muted/30 rounded-lg border border-border min-w-50">
                    <span className="text-sm font-medium text-muted-foreground mb-1">Budget Ceiling</span>
                    <span className="text-3xl font-bold text-primary">
                        {symbol}{Number(project.budget_ceiling).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground mt-2">
                        Due: {new Date(project.required_deadline).toLocaleDateString('en-GB', { timeZone: 'UTC' })}
                    </span>
                </div>
            </div>

            {/* Pipeline Header */}
            <div className="hidden md:flex items-center justify-center gap-2 mt-8 mb-2">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors ${uploadedBids.length > 0 ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border text-muted-foreground'}`}>
                    <FileUp className="w-4 h-4" />
                    <span className="text-sm font-semibold">Upload</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground/30 shrink-0" />
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors ${evaluatedBids.length > 0 ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border text-muted-foreground'}`}>
                    <BrainCircuit className="w-4 h-4" />
                    <span className="text-sm font-semibold">Evaluate</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground/30 shrink-0" />
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors ${awardedBids.length > 0 ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border text-muted-foreground'}`}>
                    <Trophy className="w-4 h-4" />
                    <span className="text-sm font-semibold">Award</span>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 md:gap-0">

                {/* Column 1: Uploaded Bids */}
                <div className="flex flex-col gap-4 md:px-4 md:border-t-2 border-slate-200 dark:border-slate-700 md:pt-4 rounded-t-lg">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                            <FileUp className="w-4 h-4" />
                            Uploaded Bids
                        </h3>
                        <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-none text-[10px]">{uploadedBids.length}</Badge>
                    </div>

                    <Button 
                        onClick={handleEvaluateAll} 
                        disabled={uploadedBids.length === 0 || isEvaluatingAll || isViewer} 
                        title={isViewer ? "Viewers cannot evaluate bids" : ""}
                        variant="default"
                        className="w-full shadow-md transition-all group"
                    >
                        {isEvaluatingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2 group-hover:animate-pulse" />}
                        Evaluate All Bids
                    </Button>

                    <div
                        onDragOver={(e) => !isViewer && handleDragOver(e)}
                        onDragLeave={(e) => !isViewer && handleDragLeave(e)}
                        onDrop={(e) => !isViewer && handleDrop(e)}
                        className={`
                            border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all bg-card ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30 dark:hover:border-muted-foreground/30'}
                            ${isUploading || isViewer ? 'opacity-50 pointer-events-none' : ''}
                        `}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
                                <p className="text-sm font-medium text-foreground">Extracting Quote Data...</p>
                            </>
                        ) : (
                            <>
                                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <UploadCloud className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-medium text-foreground mb-1">Drag and drop vendor quotes here</p>
                                <p className="text-xs text-muted-foreground mb-4">PDF, JPG, PNG up to 10MB</p>
                                <label className="cursor-pointer">
                                    <span className="bg-background border border-border text-foreground hover:bg-muted dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:hover:bg-slate-700 px-4 py-2 rounded-md text-sm font-medium inline-block transition-colors">
                                        Browse Files
                                    </span>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="application/pdf,image/*"
                                            onChange={handleFileInput}
                                            disabled={isViewer}
                                        />
                                </label>
                            </>
                        )}
                    </div>

                    <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="w-full border-dashed text-muted-foreground hover:text-primary hover:border-primary/50" disabled={isViewer} title={isViewer ? "Viewers cannot add quotes" : ""}>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Quote Manually
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-106.25">
                            <DialogHeader>
                                <DialogTitle>Add Manual Quote</DialogTitle>
                                <DialogDescription className="sr-only">Fill out the details to manually add a quote to this project.</DialogDescription>
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
                                    <Label htmlFor="total_amount" className="dark:text-slate-200">Total Amount ({symbol})</Label>
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
                                <Button type="submit" className="w-full" variant="default" disabled={isSubmittingManual}>
                                    {isSubmittingManual ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    Save Quote
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Pending Bids List */}
                    <div className="space-y-3">
                        {uploadedBids.map(bid => (
                            <QuoteDetailDialog key={bid.id} bid={bid}>
                                <Card className="shadow-sm border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 animate-in fade-in zoom-in duration-300 cursor-pointer hover:border-primary/50 transition-colors">
                                    <CardContent className="p-4 flex flex-col gap-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{bid.vendorName}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 mt-1">
                                                    <span>{bid.fileSize}</span>
                                                    <span>•</span>
                                                    <span>{bid.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {bid.status === 'evaluating' && (
                                                <Loader2 className="w-4 h-4 text-primary animate-spin mr-2" />
                                            )}
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={isViewer ? "Viewers cannot edit" : "Edit"} disabled={isViewer} onClick={(e) => { e.stopPropagation(); openEditModal(bid); }}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title={isViewer ? "Viewers cannot delete" : "Delete"} disabled={isViewer} onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: bid.id, name: bid.vendorName }); }}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <Button 
                                        variant="default"
                                        className="w-full shadow-sm transition-all group mt-1"
                                        disabled={bid.status === 'evaluating' || evaluatingBidId === bid.id || isViewer}
                                        title={isViewer ? "Viewers cannot evaluate" : ""}
                                        onClick={(e) => { e.stopPropagation(); handleRunEvaluation(bid); }}
                                    >
                                        {evaluatingBidId === bid.id || bid.status === 'evaluating' 
                                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            : <Sparkles className="w-4 h-4 mr-2 group-hover:animate-pulse" />
                                        }
                                        {evaluatingBidId === bid.id || bid.status === 'evaluating' ? 'Evaluating...' : 'Run AI Evaluation'}
                                    </Button>
                                </CardContent>
                                </Card>
                            </QuoteDetailDialog>
                        ))}
                    </div>
                </div>

                {/* Chevron separator 1 */}
                <div className="hidden md:flex items-start justify-center pt-5">
                    <ChevronRight className="w-6 h-6 text-gray-300 dark:text-slate-600" />
                </div>

                {/* Column 2: AI Evaluation */}
                <div className="flex flex-col gap-4 md:px-4 md:border-t-2 border-indigo-600/30 dark:border-indigo-500/30 md:pt-4 rounded-t-lg">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                            <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            AI Evaluation
                        </h3>
                        <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-none text-[10px]">{evaluatedBids.length}</Badge>
                    </div>

                    {/* Recommendation Reason Banner */}
                    {evaluatedBids.find(b => b.isRecommended)?.aiRationale && (
                        <div className="bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-lg p-3 text-sm">
                            <div className="flex gap-2 items-start">
                                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                                <p className="text-indigo-900 dark:text-indigo-200 leading-relaxed text-xs">
                                    <span className="font-bold block mb-1">AI Recommendation</span>
                                    {evaluatedBids.find(b => b.isRecommended)?.aiRationale}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {evaluatedBids.map(bid => (
                            <QuoteDetailDialog key={bid.id} bid={bid}>
                                <Card className={`shadow-sm transition-all cursor-pointer relative overflow-hidden ${bid.isRecommended ? 'ring-2 ring-primary/60 border-transparent bg-white dark:bg-slate-800' : bid.status === 'rejected' ? 'opacity-60 grayscale-[0.5] scale-[0.98] border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-primary/50'}`}>
                                    {bid.isRecommended && (
                                        <div className="absolute top-0 right-0 p-1 z-10">
                                            <Badge className="bg-primary text-primary-foreground border-none text-[10px] uppercase tracking-wider font-bold shadow-sm flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                Recommended
                                            </Badge>
                                        </div>
                                    )}
                                    <CardHeader className={`p-4 pb-2 ${bid.isRecommended ? 'pr-28' : ''}`}>
                                    <div className="flex justify-between items-start">
                                        <CardTitle className={`text-sm font-semibold ${bid.status === 'rejected' ? 'text-gray-500 dark:text-slate-400' : 'text-gray-900 dark:text-white'}`}>{bid.vendorName}</CardTitle>
                                        <div className="flex items-center gap-1">
                                            {bid.status !== 'rejected' && (
                                                <>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title={isViewer ? "Viewers cannot edit" : "Edit"} disabled={isViewer} onClick={(e) => { e.stopPropagation(); openEditModal(bid); }}>
                                                        <Edit className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title={isViewer ? "Viewers cannot delete" : "Delete"} disabled={isViewer} onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: bid.id, name: bid.vendorName }); }}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </>
                                            )}
                                            <Badge variant="outline" className={
                                                bid.status === 'rejected' ? 'bg-muted text-muted-foreground border-border ml-1' :
                                                bid.aiRecommendationStatus === 'Recommended' ? 'bg-primary/10 text-primary border-primary/20 ml-1' :
                                                bid.aiRecommendationStatus === 'Alternative' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 ml-1' :
                                                'bg-muted/50 text-muted-foreground ml-1'
                                            }>
                                                {bid.status === 'rejected' ? 'Not Selected' : bid.aiRecommendationStatus}
                                            </Badge>
                                        </div>
                                    </div>
                                    <CardDescription className="text-xs font-medium text-gray-900 dark:text-slate-300 mt-1">
                                        {symbol}{bid.totalAmount.toLocaleString()}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    {bid.notes && (
                                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 border-t border-gray-200 dark:border-slate-700 pt-2 whitespace-pre-wrap">
                                            {bid.notes}
                                        </p>
                                    )}
                                    {bid.status === 'evaluated' && (
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="w-full mt-4 shadow-sm transition-all"
                                            onClick={(e) => { e.stopPropagation(); handleAwardBid(bid); }}
                                            disabled={isAwardingId === bid.id || isViewer}
                                            title={isViewer ? "Viewers cannot award bids" : ""}
                                        >
                                            {isAwardingId === bid.id ? (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <Trophy className="w-4 h-4 mr-2" />
                                            )}
                                            Award Bid
                                        </Button>
                                    )}
                                </CardContent>
                                </Card>
                            </QuoteDetailDialog>
                        ))}

                        {evaluatedBids.length === 0 && (
                            <div className="p-10 text-center border border-dashed border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-800/50 flex flex-col items-center">
                                <div className="h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                                    <BrainCircuit className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
                                </div>
                                <p className="text-sm font-medium text-foreground mb-1">No bids evaluated yet</p>
                                <p className="text-xs text-muted-foreground max-w-55 leading-relaxed">
                                    Click &ldquo;Run AI Evaluation&rdquo; on an uploaded quote to analyze it against your <span className="font-medium text-primary">{symbol}{Number(project.budget_ceiling).toLocaleString()}</span> budget ceiling.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Chevron separator 2 */}
                <div className="hidden md:flex items-start justify-center pt-5">
                    <ChevronRight className="w-6 h-6 text-gray-300 dark:text-slate-600" />
                </div>

                {/* Column 3: Awarded */}
                <div className="flex flex-col gap-4 md:px-4 md:border-t-2 border-primary/30 md:pt-4 rounded-t-lg">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-muted-foreground flex items-center gap-2 uppercase tracking-wider text-[10px]">
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                            Awarded
                        </h3>
                        <Badge variant="secondary" className="bg-muted text-muted-foreground border-none text-[10px]">{awardedBids.length}</Badge>
                    </div>

                    <div className="space-y-4">
                        {awardedBids.map(bid => (
                            <QuoteDetailDialog key={bid.id} bid={bid}>
                                <Card className="shadow-md border-primary/20 bg-primary/5 relative overflow-hidden ring-1 ring-primary/10 cursor-pointer hover:border-primary/50 transition-colors">
                                    <div className="absolute top-0 right-0 p-1">
                                    <Badge className="bg-primary text-primary-foreground border-none text-[10px] uppercase tracking-wider font-bold">
                                        <Trophy className="w-3 h-3 mr-1" />
                                        Winning Bid
                                    </Badge>
                                </div>
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start pr-20">
                                        <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white">{bid.vendorName}</CardTitle>
                                    </div>
                                    <CardDescription className="text-xs font-medium text-primary mt-1">
                                        {symbol}{bid.totalAmount.toLocaleString()}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2 italic">
                                        <span className="font-semibold text-foreground not-italic">AI Rationale:</span> {bid.aiRationale}
                                    </p>
                                    <div className="mt-4 flex items-center gap-2 text-[10px] text-primary font-medium bg-primary/10 px-2 py-1 rounded w-fit">
                                        <CheckCircle2 className="w-3 h-3" />
                                        RECORD LOCKED • {bid.date}
                                    </div>
                                </CardContent>
                                </Card>
                            </QuoteDetailDialog>
                        ))}

                        {awardedBids.length === 0 && (
                            <div className="p-10 text-center border border-dashed border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-800/50 flex flex-col items-center">
                                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <Trophy className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-medium text-foreground mb-1">No bid awarded yet</p>
                                <p className="text-xs text-muted-foreground max-w-55 leading-relaxed">
                                    Once the AI evaluation is complete, review the recommendations and award the winning bid here.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            <EvaluationResults project={project} quotes={quotes} />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-100">
                    <DialogHeader>
                        <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Delete Quote
                        </DialogTitle>
                        <DialogDescription className="pt-2 text-gray-600 dark:text-slate-400">
                            Are you sure you want to delete the quote from <span className="font-semibold text-gray-900 dark:text-white">{deleteTarget?.name}</span>? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="dark:border-slate-700 dark:text-slate-300">
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Quote Dialog */}
            <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
                <DialogContent className="sm:max-w-106.25">
                    <DialogHeader>
                        <DialogTitle>Edit Quote</DialogTitle>
                        <DialogDescription className="sr-only">Update the vendor name, total amount, and payment terms for this quote.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit_vendor_name" className="dark:text-slate-200">Vendor Name</Label>
                            <Input
                                id="edit_vendor_name"
                                value={editForm.vendor_name}
                                onChange={(e) => setEditForm(f => ({ ...f, vendor_name: e.target.value }))}
                                required
                                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit_total_amount" className="dark:text-slate-200">Total Amount ({symbol})</Label>
                            <Input
                                id="edit_total_amount"
                                type="number"
                                min="0"
                                step="0.01"
                                value={editForm.total_amount}
                                onChange={(e) => setEditForm(f => ({ ...f, total_amount: e.target.value }))}
                                required
                                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit_payment_terms" className="dark:text-slate-200">Payment Terms</Label>
                            <Input
                                id="edit_payment_terms"
                                value={editForm.payment_terms}
                                onChange={(e) => setEditForm(f => ({ ...f, payment_terms: e.target.value }))}
                                required
                                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                            />
                        </div>
                        <Button type="submit" className="w-full" variant="default" disabled={isEditing}>
                            {isEditing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
