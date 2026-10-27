"use client"

import { createContext, useContext, ReactNode } from "react"

interface RoleContextType {
    role: string | null;
    isViewer: boolean;
    isAdmin: boolean;
    isEditor: boolean;
}

const RoleContext = createContext<RoleContextType>({
    role: null,
    isViewer: false,
    isAdmin: false,
    isEditor: false,
})

export function RoleProvider({ role, children }: { role: string | null, children: ReactNode }) {
    const value = {
        role,
        isViewer: role === 'Viewer',
        isAdmin: role === 'Admin',
        isEditor: role === 'Editor',
    }

    return (
        <RoleContext.Provider value={value}>
            {children}
        </RoleContext.Provider>
    )
}

export function useRole() {
    return useContext(RoleContext)
}
