"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileTypeIcon } from "./FileTypeIcon";
import { Thumb } from "./Thumb";
import { fileIcon, fmtBytes, fmtDate } from "@/lib/format";
import { viewableMime } from "@/lib/view";
import type { FileRow } from "./Drive";

// The list itself, with the conventions people know from Drive and Finder:
// sortable column headers, folders first, click to select, Ctrl/Cmd and Shift
// for several, double-click to open, arrow keys / Enter / Delete / Esc, right-click
// or ⋮ for a menu, inline rename, drag onto a folder (or a crumb) to move, and a
// grid of pictures when that suits the folder better.

export type Row = { kind: "folder"; name: string; path: string; count: number; modified: number } | { kind: "file"; f: FileRow };
type SortKey = "name" | "modified" | "size";
export const DRAG_TYPE = "application/x-stash-ids";

export function FileBrowser({
  files,
  extraFolders,
  folder,
  search,
  view,
  local,
  opening,
  selected,
  onSelect,
  onOpenFolder,
  onOpen,
  onDownload,
  onRename,
  onTrash,
  onMoveTo,
  onDropMove,
  onShare,
}: {
  files: FileRow[];
  extraFolders: string[];
  folder: string;
  search: string;
  view: "list" | "grid";
  local: Set<string>;
  opening: string | null;
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
  onOpenFolder: (path: string) => void;
  onOpen: (f: FileRow) => void;
  onDownload: (f: FileRow) => void;
  onRename: (f: FileRow, name: string) => void;
  onTrash: (f: FileRow) => void;
  onMoveTo: (ids: string[]) => void;
  onDropMove: (ids: string[], folder: string) => void;
  onShare?: (f: FileRow) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [menu, setMenu] = useState<{ f: FileRow; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<FileRow | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
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
    for (const p of extraFolders) {
      if (p !== folder && p.startsWith(prefix)) {
        const name = p.slice(prefix.length).split("/")[0];
        if (!sub.has(name)) sub.set(name, { count: 0, modified: 0 });
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
  }, [files, extraFolders, folder, search, sort]);

  const keyOf = (r: Row) => (r.kind === "folder" ? "d:" + r.path : r.f.id);
  const fileIds = (keys: Iterable<string>) => [...keys].filter((k) => !k.startsWith("d:"));

  // Click: one. Ctrl/Cmd: toggle. Shift: range from the last plain click.
  function pick(r: Row, e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) {
    const k = keyOf(r);
    if (e.shiftKey && anchor.current) {
      const a = rows.findIndex((x) => keyOf(x) === anchor.current);
      const b = rows.findIndex((x) => keyOf(x) === k);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        onSelect(new Set(rows.slice(lo, hi + 1).map(keyOf)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      onSelect(next);
    } else if (selected.size === 1 && selected.has(k)) {
      onSelect(new Set()); // clicking the only selected row again clears it
    } else {
      onSelect(new Set([k]));
    }
    anchor.current = k;
  }

  function activate(r: Row) {
    if (r.kind === "folder") onOpenFolder(r.path);
    else onOpen(r.f);
  }

  // Keyboard: arrows move, Enter opens, Delete trashes, Esc clears, F2 renames, Ctrl+A selects all.
  function onKey(e: React.KeyboardEvent) {
    if (renaming) return;
    const cur = [...selected].pop() ?? null;
    const i = rows.findIndex((r) => keyOf(r) === cur);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelect(new Set(rows.map(keyOf)));
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      if (rows[n]) {
        pick(rows[n], e.shiftKey ? { shiftKey: true } : {});
        (listRef.current?.children[n] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "Enter" && i >= 0) {
      activate(rows[i]);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
      e.preventDefault();
      for (const r of rows) if (r.kind === "file" && selected.has(r.f.id)) onTrash(r.f);
    } else if (e.key === "F2" && i >= 0 && rows[i].kind === "file") {
      setRenaming((rows[i] as { f: FileRow }).f);
    } else if (e.key === "Escape") {
      onSelect(new Set());
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

  // Drag: the selection travels (or just the row under the pointer).
  function dragStart(e: React.DragEvent, r: Row) {
    const k = keyOf(r);
    const ids = selected.has(k) ? fileIds(selected) : r.kind === "file" ? [r.f.id] : [];
    if (!ids.length) return e.preventDefault();
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  }
  const dropProps = (path: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(path);
    },
    onDragLeave: () => setDropTarget((t) => (t === path ? null : t)),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      try {
        const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as string[];
        if (ids.length) onDropMove(ids, path);
      } catch {}
    },
  });

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

  const contextMenu = (f: FileRow, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selected.has(f.id)) {
      onSelect(new Set([f.id]));
      anchor.current = f.id;
    }
    setMenu({ f, x: e.clientX, y: e.clientY });
  };

  const empty = rows.length === 0 && <p className="px-5 py-10 text-center text-ink-3">{search ? `Nothing matches "${search}".` : "This folder is empty."}</p>;

  if (view === "grid") {
    return (
      <div className="outline-none" onKeyDown={onKey} tabIndex={0} aria-label="Files" data-testid="file-grid">
        {empty}
        <ul className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {rows.map((r) => {
            const k = keyOf(r);
            const isSel = selected.has(k);
            const sel = isSel ? "ring-2 ring-ink" : "hover:border-ink-3";
            if (r.kind === "folder")
              return (
                <li key={k}>
                  <button
                    className={`card w-full p-4 flex items-center gap-3 text-left ${sel} ${dropTarget === r.path ? "bg-cream-2 border-ink" : ""}`}
                    onClick={(e) => pick(r, e)}
                    onDoubleClick={() => onOpenFolder(r.path)}
                    draggable
                    onDragStart={(e) => dragStart(e, r)}
                    {...dropProps(r.path)}
                  >
                    <FileTypeIcon kind="DIR" className="text-ink-2 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{r.name}</span>
                      <span className="block text-xs text-ink-3">{r.count} items</span>
                    </span>
                  </button>
                </li>
              );
            const f = r.f;
            return (
              <li key={k}>
                <div
                  className={`card overflow-hidden cursor-default ${sel}`}
                  onClick={(e) => pick(r, e)}
                  onDoubleClick={() => onOpen(f)}
                  onContextMenu={(e) => contextMenu(f, e)}
                  draggable
                  onDragStart={(e) => dragStart(e, r)}
                  aria-selected={isSel}
                  data-testid="grid-file"
                >
                  <Thumb f={f} className="aspect-[4/3] w-full" />
                  <div className="px-3 py-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium truncate" title={f.name}>
                      {f.name}
                    </p>
                    <span className="text-xs text-ink-3 shrink-0">{opening === f.id ? "…" : f.size === 0 ? "" : fmtBytes(f.size)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {menu && <Menu menu={menu} selectedCount={fileIds(selected).length} onOpen={onOpen} onDownload={onDownload} onRename={setRenaming} onTrash={onTrash} onMoveTo={() => onMoveTo(fileIds(selected))} onShare={onShare} close={() => setMenu(null)} />}
        {renaming && (
          <RenamePrompt
            f={renaming}
            onDone={(name) => {
              setRenaming(null);
              if (name && name !== renaming.name) onRename(renaming, name);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden outline-none" onKeyDown={onKey} tabIndex={0} aria-label="Files">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] sm:grid-cols-[28px_minmax(0,1fr)_140px_90px_auto] items-center gap-4 px-5 py-2 border-b border-line text-xs">
        <span />
        {header("name", "Name")}
        {header("modified", "Modified", "hidden sm:flex")}
        {header("size", "Size", "hidden sm:flex")}
        <span />
      </div>

      <ul ref={listRef} className="divide-y divide-line" data-testid="file-list">
        {rows.map((r) => {
          const k = keyOf(r);
          const isSel = selected.has(k);
          const base = `grid grid-cols-[28px_minmax(0,1fr)_auto] sm:grid-cols-[28px_minmax(0,1fr)_140px_90px_auto] items-center gap-4 px-5 py-2.5 select-none cursor-default ${isSel ? "bg-cream-2" : "hover:bg-cream-2/60"}`;
          if (r.kind === "folder")
            return (
              <li
                key={k}
                className={`${base} ${dropTarget === r.path ? "outline outline-2 -outline-offset-2 outline-ink" : ""}`}
                onClick={(e) => pick(r, e)}
                onDoubleClick={() => onOpenFolder(r.path)}
                draggable
                onDragStart={(e) => dragStart(e, r)}
                {...dropProps(r.path)}
                aria-selected={isSel}
              >
                <FileTypeIcon kind="DIR" className="text-ink-2" />
                <button className="font-medium truncate text-left" onClick={(e) => (e.detail === 1 ? pick(r, e) : onOpenFolder(r.path))} onDoubleClick={() => onOpenFolder(r.path)}>
                  {r.name}
                </button>
                <span className="hidden sm:block text-sm text-ink-3">{r.modified ? fmtDate(r.modified) : ""}</span>
                <span className="hidden sm:block text-sm text-ink-3">{r.count ? `${r.count} items` : "Empty"}</span>
                <span />
              </li>
            );
          const f = r.f;
          return (
            <li
              key={k}
              className={base}
              onClick={(e) => pick(r, e)}
              onDoubleClick={() => onOpen(f)}
              onContextMenu={(e) => contextMenu(f, e)}
              draggable
              onDragStart={(e) => dragStart(e, r)}
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
              <span className="hidden sm:block text-sm text-ink-3">{fmtDate(f.modifiedAt ?? f.createdAt)}</span>
              <span className="hidden sm:block text-sm text-ink-3">{f.size === 0 ? "Empty" : fmtBytes(f.size)}</span>
              <div className="flex items-center justify-end gap-1 sm:gap-2">
                {f.stored && <LocationBadge opening={opening === f.id} local={local.has(f.id)} />}
                <button
                  className="size-8 inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-white hover:text-ink"
                  aria-label={`More actions for ${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!selected.has(f.id)) onSelect(new Set([f.id]));
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu({ f, x: rect.right, y: rect.bottom });
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
        {rows.length === 0 && <li>{empty}</li>}
      </ul>

      {menu && <Menu menu={menu} selectedCount={fileIds(selected).length} onOpen={onOpen} onDownload={onDownload} onRename={setRenaming} onTrash={onTrash} onMoveTo={() => onMoveTo(fileIds(selected))} onShare={onShare} close={() => setMenu(null)} />}
    </div>
  );
}

function LocationBadge({ opening, local }: { opening: boolean; local: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${opening ? "border-line text-ink-2" : local ? "border-ok/40 bg-ok-soft text-ok" : "border-line bg-cream-2 text-ink-2"}`}
      data-testid="location"
      title={opening ? "Downloading" : local ? "On this device" : "In cloud"}
    >
      {opening ? (
        <>
          <span className="inline-block size-3 rounded-full border-2 border-ink-3 border-t-ink animate-spin" aria-hidden />
          <span className="hidden sm:inline">Downloading</span>
        </>
      ) : local ? (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">On this device</span>
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3.5 9.5a2.5 2.5 0 0 1-.3-5 3 3 0 0 1 5.8-.6A2.3 2.3 0 0 1 9 9.5H3.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">In cloud</span>
        </>
      )}
    </span>
  );
}

function Menu({
  menu,
  selectedCount,
  onOpen,
  onDownload,
  onRename,
  onTrash,
  onMoveTo,
  onShare,
  close,
}: {
  menu: { f: FileRow; x: number; y: number };
  selectedCount: number;
  onOpen: (f: FileRow) => void;
  onDownload: (f: FileRow) => void;
  onRename: (f: FileRow) => void;
  onTrash: (f: FileRow) => void;
  onMoveTo: () => void;
  onShare?: (f: FileRow) => void;
  close: () => void;
}) {
  const many = selectedCount > 1;
  return (
    <div
      role="menu"
      className="fixed z-[90] w-52 card bg-white p-1 shadow-lg text-sm"
      style={{ left: Math.min(menu.x, window.innerWidth - 216), top: Math.min(menu.y, window.innerHeight - 260) }}
      onClick={(e) => e.stopPropagation()}
    >
      {!many && <MenuItem onClick={() => (close(), onOpen(menu.f))}>{viewableMime(menu.f.mime, menu.f.name) ? "Open" : "Download"}</MenuItem>}
      {!many && viewableMime(menu.f.mime, menu.f.name) && <MenuItem onClick={() => (close(), onDownload(menu.f))}>Download</MenuItem>}
      {!many && onShare && <MenuItem onClick={() => (close(), onShare(menu.f))}>Get link</MenuItem>}
      {!many && <MenuItem onClick={() => (close(), onRename(menu.f))}>Rename</MenuItem>}
      <MenuItem onClick={() => (close(), onMoveTo())}>{many ? `Move ${selectedCount} items to…` : "Move to…"}</MenuItem>
      <div className="my-1 border-t border-line" />
      <MenuItem onClick={() => (close(), onTrash(menu.f))}>{many ? `Move ${selectedCount} items to trash` : "Move to trash"}</MenuItem>
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

// Grid view has no inline field; a small prompt does the same job.
function RenamePrompt({ f, onDone }: { f: FileRow; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(f.name);
  return (
    <div className="fixed inset-0 z-[100] bg-ink/40 flex items-center justify-center p-3" onClick={() => onDone(null)}>
      <form
        className="card bg-cream p-5 w-full max-w-sm flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onDone(v.trim());
        }}
      >
        <h2 className="text-lg font-semibold">Rename</h2>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} className="rounded-full border border-line bg-white px-4 py-2 outline-none focus:border-ink" aria-label="New name" />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Rename
          </button>
        </div>
      </form>
    </div>
  );
}
