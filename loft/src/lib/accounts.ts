"use client";

// Accounts that have signed in on this browser, for the chooser on the sign-in
// page. Names and emails only; never a key or a session.

const STORE = "stash_accounts_v1";

export type Remembered = { email: string; name?: string | null; picture?: string | null; lastUsed: number };

export function rememberedAccounts(): Remembered[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) ?? "[]") as Remembered[];
    return Array.isArray(list) ? list.sort((a, b) => b.lastUsed - a.lastUsed) : [];
  } catch {
    return [];
  }
}

export function rememberAccount(a: { email: string; name?: string | null; picture?: string | null }) {
  try {
    const rest = rememberedAccounts().filter((x) => x.email !== a.email);
    localStorage.setItem(STORE, JSON.stringify([{ ...a, lastUsed: Date.now() }, ...rest].slice(0, 6)));
  } catch {}
}

export function forgetAccount(email: string) {
  try {
    localStorage.setItem(STORE, JSON.stringify(rememberedAccounts().filter((x) => x.email !== email)));
  } catch {}
}
