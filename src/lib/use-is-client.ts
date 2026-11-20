import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

// false on the server and during hydration, true once the component is running in the browser.
// Replaces the `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`
// pattern with the same behaviour, without an extra render.
export function useIsClient(): boolean {
    return useSyncExternalStore(subscribe, () => true, () => false)
}
