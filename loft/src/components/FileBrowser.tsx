"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileTypeIcon } from "./FileTypeIcon";
import { fileIcon, fmtBytes, fmtDate } from "@/lib/format";
import { viewableMime } from "@/lib/view";
import type { FileRow } from "./Drive";

// The list itself, with the conventions people know from Drive and Finder:
// sortable column headers, folders first, click to select, double-click to open,
// arrow keys / Enter / Delete / Esc, right-click or ⋮ for a menu, inline rename.

type Row = { kind: "folder"; name: string; path: string; count: number; modified: number } | { kind: "file"; f: FileRow };
type SortKey = "name" | "modified" | "size";

export function FileBrowser({
  files,
  folder,
  search,
  local,
  opening,
  onOpenFolder,
  onOpen,
  onDownload,
  onRename,
  onTrash,
}: {
  files: FileRow[];
  folder: string;
  search: string;
  local: Set<string>;
  opening: string | null;
  onOpenFolder: (path: string) => void;
  onOpen: (f: FileRow) => void;
  onDownload: (f: FileRow) => void;
  onRename: (f: FileRow, name: string) => void;
  onTrash: (f: FileRow) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ f: FileRow; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<FileRow | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const rows = useMemo<Row[]>(() => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return files.filter((f) => f.name.toLowerCase().includes(q)).map((f) => ({ kind: "file", f }));
    }
    const prefix = folder ? folder + "/" : "";
    const sub = new Map<string, { count: number; modified: number }>();
    const here: Row[] = [];
    for (const f of files) {
      if (f.folder === folder) here.push({ kind: "file", f });
      else if (f.folder.startsWith(prefix)) {
        const name = f.folder.slice(prefix.length).split("/")[0];
        const s = sub.get(name) ?? { count: 0, modified: 0 };
        s.count++;
        s.modified = Math.max(s.modified, f.createdAt);
        sub.set(name, s);
      }
    }
    const folders: Row[] = [...sub].map(([name, s]) => ({ kind: "folder", name, path: prefix + name, ...s }));
    const cmp = (a: Row, b: Row) => {
      const na = a.kind === "folder" ? a.name : a.f.name;
      const nb = b.kind === "folder" ? b.name : b.f.name;
      if (sort.key === "name") return na.localeCompare(nb, undefined, { numeric: true, sensitivity: "base" }) * sort.dir;
      if (sort.key === "modified") return ((a.kind === "folder" ? a.modified : a.f.createdAt) - (b.kind === "folder" ? b.modified : b.f.createdAt)) * sort.dir;
      return ((a.kind === "folder" ? -1 : a.f.size) - (b.kind === "folder" ? -1 : b.f.size)) * sort.dir;
    };
    return [...folders.sort(cmp), ...here.sort(cmp)];
  }, [files, folder, search, sort]);

  const keyOf = (r: Row) => (r.kind === "folder" ? "d:" + r.path : r.f.id);

  function activate(r: Row) {
    if (r.kind === "folder") onOpenFolder(r.path);
    else onOpen(r.f);
  }

  // Keyboard: arrows move, Enter opens, Delete trashes, Esc clears, F2 renames.
  function onKey(e: React.KeyboardEvent) {
    if (renaming) return;
    const i = rows.findIndex((r) => keyOf(r) === selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      if (rows[n]) {
        setSelected(keyOf(rows[n]));
        (listRef.current?.children[n] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "Enter" && i >= 0) {
      activate(rows[i]);
    } else if ((e.key === "Delete" || e.key === "Backspace") && i >= 0 && rows[i].kind === "file") {
      e.preventDefault();
      onTrash((rows[i] as { f: FileRow }).f);
    } else if (e.key === "F2" && i >= 0 && rows[i].kind === "file") {
      setRenaming((rows[i] as { f: FileRow }).f);
    } else if (e.key === "Escape") {
      setSelected(null);
      setMenu(null);
    }
  }

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const header = (k: SortKey, label: string, className = "") => (
    <button
      key={k}
      className={`flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink ${className}`}
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : 1 }))}
      aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      {label}
      {sort.key === k && (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={sort.dir === -1 ? "rotate-180" : ""}>
          <path d="M5 2l3.5 4h-7z" fill="currentColor" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="card overflow-hidden" onKeyDown={onKey} tabIndex={0} aria-label="Files">
      <div className="grid grid-cols-[28px_1fr_140px_90px_200px] items-center gap-4 px-5 py-2 border-b border-line text-xs">
        <span />
        {header("name", "Name")}
        {header("modified", "Modified", "hidden sm:flex")}
        {header("size", "Size", "hidden sm:flex")}
        <span />
      </div>

      <ul ref={listRef} className="divide-y divide-line" data-testid="file-list">
        {rows.map((r) => {
          const k = keyOf(r);
          const isSel = selected === k;
          const base = `grid grid-cols-[28px_1fr_140px_90px_200px] items-center gap-4 px-5 py-2.5 select-none cursor-default ${isSel ? "bg-cream-2" : "hover:bg-cream-2/60"}`;
          if (r.kind === "folder")
            return (
              <li
                key={k}
                className={base}
                onClick={() => setSelected(k)}
                onDoubleClick={() => onOpenFolder(r.path)}
                aria-selected={isSel}
              >
                <FileTypeIcon kind="DIR" className="text-ink-2" />
                <button className="font-medium truncate text-left" onClick={(e) => (e.detail === 1 ? setSelected(k) : onOpenFolder(r.path))} onDoubleClick={() => onOpenFolder(r.path)}>
                  {r.name}
                </button>
                <span className="hidden sm:block text-sm text-ink-3">{r.modified ? fmtDate(r.modified) : ""}</span>
                <span className="hidden sm:block text-sm text-ink-3">{r.count} items</span>
                <span />
              </li>
            );
          const f = r.f;
          return (
            <li
              key={k}
              className={base}
              onClick={() => setSelected(k)}
              onDoubleClick={() => onOpen(f)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSelected(k);
                setMenu({ f, x: e.clientX, y: e.clientY });
              }}
              aria-selected={isSel}
            >
              <FileTypeIcon kind={fileIcon(f.mime, f.name)} className="text-ink-2" />
              <div className="min-w-0">
                {renaming?.id === f.id ? (
                  <RenameBox
                    initial={f.name}
                    onDone={(name) => {
                      setRenaming(null);
                      if (name && name !== f.name) onRename(f, name);
                    }}
                  />
                ) : (
                  <p className="font-medium truncate" title={f.name}>
                    {f.name}
                    {search && f.folder && <span className="ml-2 font-normal text-ink-3 text-xs">{f.folder.replace(/\//g, " / ")}</span>}
                  </p>
                )}
              </div>
              <span className="hidden sm:block text-sm text-ink-3">{fmtDate(f.createdAt)}</span>
              <span className="hidden sm:block text-sm text-ink-3">{f.size === 0 ? "Empty" : fmtBytes(f.size)}</span>
              <div className="flex items-center justify-end gap-2">
                {f.stored && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      opening === f.id ? "border-line text-ink-2" : local.has(f.id) ? "border-ok/40 bg-ok-soft text-ok" : "border-line bg-cream-2 text-ink-2"
                    }`}
                    data-testid="location"
                  >
                    {opening === f.id ? (
                      <>
                        <span className="inline-block size-3 rounded-full border-2 border-ink-3 border-t-ink animate-spin" aria-hidden />
                        Downloading
                      </>
                    ) : local.has(f.id) ? (
                      "On this device"
                    ) : (
                      "In cloud"
                    )}
                  </span>
                )}
                <button
                  className="size-8 inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-white hover:text-ink"
                  aria-label={`More actions for ${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(k);
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu({ f, x: r.right, y: r.bottom });
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                    <circle cx="8" cy="3" r="1.5" fill="currentColor" />
                    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                    <circle cx="8" cy="13" r="1.5" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-5 py-10 text-center text-ink-3">{search ? `Nothing matches "${search}".` : "This folder is empty."}</li>
        )}
      </ul>

      {menu && (
        <div
          role="menu"
          className="fixed z-[90] w-48 card bg-white p-1 shadow-lg text-sm"
          style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 190) }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => (setMenu(null), onOpen(menu.f))}>{viewableMime(menu.f.mime, menu.f.name) ? "Open" : "Download"}</MenuItem>
          {viewableMime(menu.f.mime, menu.f.name) && <MenuItem onClick={() => (setMenu(null), onDownload(menu.f))}>Download</MenuItem>}
          <MenuItem onClick={() => (setMenu(null), setRenaming(menu.f))}>Rename</MenuItem>
          <div className="my-1 border-t border-line" />
          <MenuItem onClick={() => (setMenu(null), onTrash(menu.f))}>Move to trash</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" className="w-full text-left rounded-lg px-3 py-2 hover:bg-cream-2" onClick={onClick}>
      {children}
    </button>
  );
}

function RenameBox({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length); // select the name, keep the extension
  }, [initial]);
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(v.trim());
        if (e.key === "Escape") onDone(null);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="w-full rounded-md border border-ink bg-white px-2 py-1 text-sm font-medium outline-none"
      aria-label="New name"
    />
  );
}
