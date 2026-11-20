"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// The smooth-scroll instance replaces the version info Lenis itself puts on window.lenis
const lenisHolder = (): { lenis?: unknown } => window as unknown as { lenis?: unknown };

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            smoothWheel: true,
            wheelMultiplier: 1,
            touchMultiplier: 2,
            infinite: false,
        });

        lenisHolder().lenis = lenis;

        function raf(time: number) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        return () => {
            lenis.destroy();
            delete lenisHolder().lenis;
        };
    }, []);

    return <>{children}</>;
}
