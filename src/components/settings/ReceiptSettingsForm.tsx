"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Save, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/components/RoleProvider"
import { removeLetterhead, updateReceiptSettings, uploadLetterhead } from "@/app/actions/receipts"

export interface ReceiptSettingsData {
    legal_name: string
    address: string
    signatories: { name: string; title: string }[]
    receipt_prefix: string
    receipt_next_number: number
    tax_exempt_receipts: boolean
    tax_exempt_reference: string
    last_issued: number
    // Short-lived private link to the uploaded letterhead, for the preview
    letterhead_url: string | null
    invoice_prefix: string
    invoice_next_number: number
    payment_details: string
    last_invoice_issued: number
}

const LETTERHEAD_MAX_BYTES = 1024 * 1024

// Upload, preview and remove the letterhead image. Saved straight away, separately from the form below.
function LetterheadUpload({ url, isAdmin }: { url: string | null; isAdmin: boolean }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const upload = async (file: File | undefined) => {
        if (!file) return
        if (!["image/png", "image/jpeg"].includes(file.type)) return toast.error("Upload the letterhead as a PNG or JPG image")
        if (file.size > LETTERHEAD_MAX_BYTES) return toast.error("The letterhead is too large. The limit is 1 MB.")
        setBusy(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await uploadLetterhead(fd)
            if (!res.success) return toast.error(res.error)
            toast.success("Letterhead uploaded")
            router.refresh()
        } finally {
            setBusy(false)
            if (inputRef.current) inputRef.current.value = ""
        }
    }

    const remove = async () => {
        setBusy(true)
        try {
            const res = await removeLetterhead()
            if (!res.success) return toast.error(res.error)
            toast.success("Letterhead removed")
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-2">
            <Label>Letterhead image (optional)</Label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Your own letterhead, printed across the top of donation receipts in place of the legal name and address below.
                A wide PNG or JPG works best (for example 2000 x 400 pixels), up to 1 MB.
            </p>
            {url && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived private link, not a static asset */}
                    <img src={url} alt="Current letterhead" className="mx-auto max-h-32 w-auto object-contain" />
                </div>
            )}
            {isAdmin && (
                <div className="flex items-center gap-3">
                    <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" aria-label="Letterhead image file" onChange={(e) => upload(e.target.files?.[0])} />
                    <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
                        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        {url ? "Replace letterhead" : "Upload letterhead"}
                    </Button>
                    {url && (
                        <Button type="button" variant="ghost" disabled={busy} onClick={remove} className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4 mr-2" />Remove
                        </Button>
                    )}
                </div>
            )}
            {!isAdmin && !url && <p className="text-sm text-slate-500">No letterhead uploaded.</p>}
        </div>
    )
}

// Letterhead, signatories and donation receipt numbering (spec 3.1 and 5.3). Admins only.
export function ReceiptSettingsForm({ initial }: { initial: ReceiptSettingsData }) {
    const router = useRouter()
    const { isAdmin } = useRole()
    const [form, setForm] = useState({
        ...initial,
        receipt_next_number: String(initial.receipt_next_number),
        invoice_next_number: String(initial.invoice_next_number),
        signatories: [0, 1, 2].map((i) => initial.signatories[i] ?? { name: "", title: "" }),
    })
    const [saving, setSaving] = useState(false)
    const disabled = !isAdmin || saving
    const next = Number(form.receipt_next_number) || 0
    const preview = `${form.receipt_prefix}${next || "?"}`
    const invoicePreview = `${form.invoice_prefix}${Number(form.invoice_next_number) || "?"}`

    const setSig = (i: number, key: "name" | "title", value: string) =>
        setForm((f) => ({ ...f, signatories: f.signatories.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }))

    const save = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await updateReceiptSettings({
                legal_name: form.legal_name, address: form.address, signatories: form.signatories,
                receipt_prefix: form.receipt_prefix, receipt_next_number: form.receipt_next_number,
                tax_exempt_receipts: form.tax_exempt_receipts, tax_exempt_reference: form.tax_exempt_reference,
                invoice_prefix: form.invoice_prefix, invoice_next_number: form.invoice_next_number, payment_details: form.payment_details,
            })
            if (!res.success) return toast.error(res.error)
            toast.success("Receipt settings saved")
            router.refresh()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">Receipts, invoices &amp; letterhead</h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Printed on donation receipts, invoices you issue and, later, on your financial statements.</p>
            <div className="mb-6">
                <LetterheadUpload url={initial.letterhead_url} isAdmin={isAdmin} />
            </div>
            <form onSubmit={save} className="space-y-6">
                <fieldset disabled={disabled} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="legalName">Legal name</Label>
                        <Input id="legalName" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} maxLength={200} placeholder="e.g. Persatuan Kebajikan Harapan Malaysia" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="orgAddress">Address</Label>
                        <Textarea id="orgAddress" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={500} rows={3} />
                    </div>
                    <div className="space-y-2">
                        <Label>Signatories (up to three; the first one signs receipts)</Label>
                        {form.signatories.map((s, i) => (
                            <div key={i} className="grid grid-cols-2 gap-3">
                                <Input aria-label={`Signatory ${i + 1} name`} placeholder="Name" value={s.name} onChange={(e) => setSig(i, "name", e.target.value)} maxLength={100} />
                                <Input aria-label={`Signatory ${i + 1} title`} placeholder="Title, e.g. Treasurer" value={s.title} onChange={(e) => setSig(i, "title", e.target.value)} maxLength={100} />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="receiptPrefix">Receipt number prefix</Label>
                            <Input id="receiptPrefix" value={form.receipt_prefix} onChange={(e) => setForm({ ...form, receipt_prefix: e.target.value })} maxLength={20} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="receiptNext">Next receipt number</Label>
                            <Input id="receiptNext" inputMode="numeric" value={form.receipt_next_number} onChange={(e) => setForm({ ...form, receipt_next_number: e.target.value })} />
                        </div>
                        <p className="col-span-2 -mt-3 text-xs text-slate-500">
                            The next receipt will be <span className="font-mono font-medium">{preview}</span>.
                            {initial.last_issued > 0
                                ? ` The last one issued was number ${initial.last_issued}, so the next number must be higher.`
                                : " If you used paper receipt books before, start after your last paper number."}
                        </p>
                    </div>
                    <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                        <label className="flex items-start gap-3 text-sm">
                            <input type="checkbox" className="mt-1" checked={form.tax_exempt_receipts} onChange={(e) => setForm({ ...form, tax_exempt_receipts: e.target.checked })} />
                            <span>
                                <span className="font-medium text-slate-900 dark:text-white">We are approved to issue tax-exempt receipts</span>
                                <span className="block text-slate-500 dark:text-slate-400">Turn on only if your organisation has the approval (for example under section 44(6) of the Income Tax Act). Receipts issued while this is on show the statement and your approval reference.</span>
                            </span>
                        </label>
                        {form.tax_exempt_receipts && (
                            <div className="space-y-2">
                                <Label htmlFor="taxRef">Approval reference</Label>
                                <Input id="taxRef" value={form.tax_exempt_reference} onChange={(e) => setForm({ ...form, tax_exempt_reference: e.target.value })} maxLength={200} />
                            </div>
                        )}
                    </div>

                    <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                        <p className="font-medium text-slate-900 dark:text-white">Invoices you issue</p>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="invoicePrefix">Invoice number prefix</Label>
                                <Input id="invoicePrefix" value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} maxLength={20} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoiceNext">Next invoice number</Label>
                                <Input id="invoiceNext" inputMode="numeric" value={form.invoice_next_number} onChange={(e) => setForm({ ...form, invoice_next_number: e.target.value })} />
                            </div>
                            <p className="col-span-2 -mt-3 text-xs text-slate-500">
                                The next invoice will be <span className="font-mono font-medium">{invoicePreview}</span>.
                                {initial.last_invoice_issued > 0 && ` The last one issued was number ${initial.last_invoice_issued}, so the next number must be higher.`}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="paymentDetails">Payment details</Label>
                            <Textarea id="paymentDetails" value={form.payment_details} onChange={(e) => setForm({ ...form, payment_details: e.target.value })} maxLength={1000} rows={3}
                                placeholder={"e.g. Maybank, Persatuan Kebajikan Harapan\nAccount no. 5123 4567 8901\nPlease quote the invoice number."} />
                            <p className="text-xs text-slate-500">Printed on invoices you issue so people know how to pay you.</p>
                        </div>
                    </div>
                </fieldset>
                {isAdmin ? (
                    <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Save receipt settings
                    </Button>
                ) : (
                    <p className="text-sm text-slate-500">Only Admins can change these settings.</p>
                )}
            </form>
        </div>
    )
}
