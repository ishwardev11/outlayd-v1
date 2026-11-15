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
    CAD: { code: "CAD", symbol: "C$", label: "CAD (C$)" },
    AUD: { code: "AUD", symbol: "A$", label: "AUD (A$)" },
    SGD: { code: "SGD", symbol: "S$", label: "SGD (S$)" },
    INR: { code: "INR", symbol: "₹", label: "INR (₹)" },
    JPY: { code: "JPY", symbol: "¥", label: "JPY (¥)" },
};

// Currencies an organization can choose as its base currency. Each has automatic exchange rates
// and is shown with 2 decimals. The order here is the order shown in the dropdowns.
export const BASE_CURRENCY_CODES = ["MYR", "SGD", "USD", "EUR", "GBP", "AUD"] as const;
export type BaseCurrencyCode = (typeof BASE_CURRENCY_CODES)[number];

export const BASE_CURRENCIES: CurrencyDetails[] = BASE_CURRENCY_CODES.map((code) => SUPPORTED_CURRENCIES[code]);

export function isBaseCurrencyCode(code: unknown): code is BaseCurrencyCode {
    return typeof code === "string" && (BASE_CURRENCY_CODES as readonly string[]).includes(code.toUpperCase());
}

// Currencies suggested for a document printed in a currency other than the base.
// Any other 3-letter code can be typed in ("Other"), with the exchange rate entered by hand.
export const DOCUMENT_CURRENCY_CODES: string[] = Array.from(
    new Set<string>([...BASE_CURRENCY_CODES, "CAD", "INR", "JPY", "THB", "IDR", "CNY", "HKD", "KRW", "PHP", "NZD", "CHF"])
);

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
