"use client";

import { createContext, useContext } from "react";

export type MayaDock = { open: boolean; setOpen: (open: boolean) => void; ask: (text: string) => void };

export const MayaContext = createContext<MayaDock>({ open: false, setOpen: () => {}, ask: () => {} });

/** Open Maya's dock from anywhere in the workspace, optionally with a question ready (never auto-sent). */
export const useMaya = () => useContext(MayaContext);
