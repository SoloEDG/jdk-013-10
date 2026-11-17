import type { ProgramDocument } from "../model/types";

const storageKey = "shoreline-program-v1";

export function loadProgram(): ProgramDocument | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const doc = parsed as Partial<ProgramDocument>;
    if (!Array.isArray(doc.items) || typeof doc.title !== "string") return null;
    return doc as ProgramDocument;
  } catch {
    return null;
  }
}

export function persistProgram(doc: ProgramDocument): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
