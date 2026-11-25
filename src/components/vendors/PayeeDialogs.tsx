"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createPayee, updateVendor } from "@/app/actions/ledger";
import { PAYEE_TYPES, type PayeeListItem } from "@/utils/payee-types";
import { errorMessage } from "@/utils/row-types";

function TypeSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
    return (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white">
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                {PAYEE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="cursor-pointer">{t.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function AddPayeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const [name, setName] = useState("");
    const [type, setType] = useState("vendor");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await createPayee(name, type);
            toast.success(`Added ${name.trim()}`);
            setName("");
            setType("vendor");
            onOpenChange(false);
        } catch (e) {
            toast.error(errorMessage(e) || "Failed to add contact");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add contact</DialogTitle>
                    <DialogDescription>A contact is anyone money comes from or goes to: a supplier, donor, member, grantor or anyone else.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="payee-name">Name</Label>
                        <Input id="payee-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder="e.g. Yayasan Harapan" className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
                    </div>
                    <div className="space-y-2">
                        <Label>Type</Label>
                        <TypeSelect value={type} onChange={setType} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={save} disabled={saving || !name.trim()} className="bg-indigo-600 hover:bg-indigo-700">
                        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Add contact
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function PayeeDetailsDialog({ payee, onOpenChange, disabled }: { payee: PayeeListItem | null; onOpenChange: (open: boolean) => void; disabled?: boolean }) {
    // The form is remounted per payee (key) so each one starts from its own saved values
    return (
        <Dialog open={!!payee} onOpenChange={onOpenChange}>
            <DialogContent>
                {payee && <DetailsForm key={payee.id} payee={payee} onClose={() => onOpenChange(false)} disabled={disabled} />}
            </DialogContent>
        </Dialog>
    );
}

function DetailsForm({ payee, onClose, disabled }: { payee: PayeeListItem; onClose: () => void; disabled?: boolean }) {
    const [name, setName] = useState<string>(payee.name ?? "");
    const [type, setType] = useState<string>(payee.payee_type ?? "vendor");
    const [email, setEmail] = useState<string>(payee.email ?? "");
    const [phone, setPhone] = useState<string>(payee.phone ?? "");
    const [address, setAddress] = useState<string>(payee.address ?? "");
    const [registration, setRegistration] = useState<string>(payee.registration_number ?? "");
    const [notes, setNotes] = useState<string>(payee.notes ?? "");
    const [saving, setSaving] = useState(false);
    const locked = !!payee.is_system || !!disabled;

    const save = async () => {
        setSaving(true);
        try {
            const updates: Record<string, unknown> = { email, phone, address, registration_number: registration, notes };
            if (!payee.is_system) {
                updates.name = name;
                updates.payee_type = type;
            }
            await updateVendor(payee.id, updates);
            toast.success("Contact saved");
            onClose();
        } catch (e) {
            // A duplicate name comes back from the database as a generic failure
            toast.error("Could not save. Check that no other contact already has this name.");
        } finally {
            setSaving(false);
        }
    };

    const field = "bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white";

    return (
        <>
            <DialogHeader>
                <DialogTitle>{payee.is_system ? payee.name : "Contact details"}</DialogTitle>
                <DialogDescription>
                    {payee.is_system
                        ? "A built-in contact so a donation never needs a donor record. Its name and type are fixed."
                        : "Contact details are optional. Do not enter bank account numbers here."}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
                {!payee.is_system && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="pd-name">Name</Label>
                            <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} disabled={locked} className={field} />
                        </div>
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <TypeSelect value={type} onChange={setType} disabled={locked} />
                        </div>
                    </>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="pd-email">Email</Label>
                        <Input id="pd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} disabled={disabled} className={field} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pd-phone">Phone</Label>
                        <Input id="pd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={255} disabled={disabled} className={field} />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="pd-address">Address</Label>
                    <Textarea id="pd-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} rows={2} disabled={disabled} className={field} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="pd-reg">Registration or tax number</Label>
                    <Input id="pd-reg" value={registration} onChange={(e) => setRegistration(e.target.value)} maxLength={255} disabled={disabled} className={field} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="pd-notes">Notes</Label>
                    <Textarea id="pd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} disabled={disabled} className={field} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={save} disabled={saving || disabled || (!payee.is_system && !name.trim())} className="bg-indigo-600 hover:bg-indigo-700">
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save
                </Button>
            </DialogFooter>
        </>
    );
}
