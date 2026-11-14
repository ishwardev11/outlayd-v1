"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lookupExchangeRate } from "@/app/actions/fx";
import { SUPPORTED_CURRENCIES } from "@/utils/currency";

export interface FxState {
    currency: string;
    originalAmount: number | "";
    rate: number | "";
    source: "ecb" | "manual" | null;
}

const EXTRA_CURRENCIES = ["THB", "IDR", "CNY", "HKD", "KRW", "PHP", "NZD", "CHF"];

export const convertedAmount = (fx: FxState): number | null => {
    const o = Number(fx.originalAmount);
    const r = Number(fx.rate);
    return o > 0 && r > 0 ? Math.round(o * r * 100) / 100 : null;
};

interface Props {
    baseCurrency: string;
    fx: FxState;
    currentAmount: number;
    documentDate: string;
    disabled?: boolean;
    onChange: (next: FxState) => void;
}

export function CurrencyConversionPanel({ baseCurrency, fx, currentAmount, documentDate, disabled, onChange }: Props) {
    const [loading, setLoading] = useState(false);
    const isForeign = fx.currency !== baseCurrency;
    const options = Array.from(new Set([baseCurrency, ...Object.keys(SUPPORTED_CURRENCIES), ...EXTRA_CURRENCIES, fx.currency]));
    const converted = convertedAmount(fx);

    const fetchRate = async (currency: string, next: FxState) => {
        setLoading(true);
        try {
            const res = await lookupExchangeRate({ from: currency, date: documentDate || null });
            if (res.success) {
                onChange({ ...next, rate: res.rate, source: "ecb" });
                toast.success(`Rate found: 1 ${currency} = ${res.rate} ${baseCurrency}`, { description: `ECB reference rate for ${res.rateDate}. Check it, or type your bank's rate.` });
            } else {
                toast.error("No rate found", { description: res.error });
            }
        } catch {
            toast.error("Could not look up the rate", { description: "Type the rate yourself." });
        } finally {
            setLoading(false);
        }
    };

    const handleCurrencyChange = (currency: string) => {
        if (currency === baseCurrency) {
            onChange({ currency, originalAmount: "", rate: "", source: null });
            return;
        }
        // Switching to a foreign currency: the figure on screen becomes the document amount
        const next: FxState = {
            currency,
            originalAmount: fx.originalAmount === "" ? currentAmount || "" : fx.originalAmount,
            rate: "",
            source: null,
        };
        onChange(next);
        void fetchRate(currency, next);
    };

    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                    <Label className="dark:text-slate-300">Currency on the document</Label>
                    <Select value={fx.currency} onValueChange={handleCurrencyChange} disabled={disabled}>
                        <SelectTrigger className="dark:bg-slate-950 dark:border-slate-800"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {options.map((c) => (
                                <SelectItem key={c} value={c}>{c}{c === baseCurrency ? " (your base currency)" : ""}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {!isForeign && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 pb-2">No conversion needed.</p>
                )}
            </div>

            {isForeign && (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="fx-original" className="dark:text-slate-300">Total on the document ({fx.currency})</Label>
                            <Input
                                id="fx-original"
                                inputMode="decimal"
                                value={fx.originalAmount}
                                onChange={(e) => onChange({ ...fx, originalAmount: e.target.value === "" ? "" : parseFloat(e.target.value) || 0 })}
                                className="dark:bg-slate-950 dark:border-slate-800"
                                disabled={disabled}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fx-rate" className="dark:text-slate-300">Rate: 1 {fx.currency} = ? {baseCurrency}</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="fx-rate"
                                    inputMode="decimal"
                                    value={fx.rate}
                                    onChange={(e) => onChange({ ...fx, rate: e.target.value === "" ? "" : parseFloat(e.target.value) || 0, source: "manual" })}
                                    className="dark:bg-slate-950 dark:border-slate-800"
                                    disabled={disabled}
                                />
                                <Button type="button" variant="outline" size="icon" disabled={disabled || loading} title={`Look up the rate for the document date`} onClick={() => fetchRate(fx.currency, fx)}>
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        {converted !== null
                            ? <>Counted as <span className="font-semibold">{baseCurrency} {converted.toFixed(2)}</span>{fx.source === "ecb" ? " (ECB reference rate for the document date)" : fx.source === "manual" ? " (rate entered by you)" : ""}.</>
                            : <span className="text-amber-700 dark:text-amber-400">Enter the rate (or press the refresh button) to convert this into {baseCurrency}. It cannot be approved without one.</span>}
                    </p>
                </div>
            )}
        </div>
    );
}
