// Files in the "receipts" bucket are referenced either by their storage path ("<orgId>/<file>")
// or, for older rows, by the full public URL. This turns either form into a storage path.
const BUCKET = "receipts"

export function toStoragePath(stored: string): string | null {
    if (!/^https?:\/\//i.test(stored)) return stored
    const marker = `/storage/v1/object/public/${BUCKET}/`
    const index = stored.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(stored.slice(index + marker.length).split("?")[0])
}