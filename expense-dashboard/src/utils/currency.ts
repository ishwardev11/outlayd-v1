export interface CurrencyDetails {
    code: string;
    symbol: string;
    label: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyDetails> = {
    MYR: { code: "MYR", symbol: "RM", label: "MYR (RM)" },
    USD: { code: "USD", symbol: "$", label: "USD ($)" },
    EUR: { code: "EUR", symbol: "€", label: "EUR (€)" },
    GBP: { code: "GBP", symbol: "£", label: "GBP (£)" },
    CAD: { code: "CAD", symbol: "$", label: "CAD ($)" },
    AUD: { code: "AUD", symbol: "$", label: "AUD ($)" },
    SGD: { code: "SGD", symbol: "S$", label: "SGD (S$)" },
    INR: { code: "INR", symbol: "₹", label: "INR (₹)" },
    JPY: { code: "JPY", symbol: "¥", label: "JPY (¥)" },
};

export function getCurrencyDetails(code?: string | null): CurrencyDetails {
    if (!code) return SUPPORTED_CURRENCIES.MYR;
    const upper = code.toUpperCase().trim();
    if (SUPPORTED_CURRENCIES[upper]) {
        return SUPPORTED_CURRENCIES[upper];
    }
    // Check if the input is already a symbol
    for (const item of Object.values(SUPPORTED_CURRENCIES)) {
        if (item.symbol === code) {
            return item;
        }
    }
    return { code: upper, symbol: upper, label: upper };
}

export function formatCurrency(
    amount: number | string | null | undefined,
    currencyCodeOrSymbol: string = "MYR",
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
    const val = Number(amount || 0);
    const details = getCurrencyDetails(currencyCodeOrSymbol);
    const minDec = options?.minimumFractionDigits ?? 2;
    const maxDec = options?.maximumFractionDigits ?? 2;
    return `${details.symbol}${val.toLocaleString(undefined, {
        minimumFractionDigits: minDec,
        maximumFractionDigits: maxDec,
    })}`;
}
