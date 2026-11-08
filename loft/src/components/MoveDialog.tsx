"use client";

import { useMemo, useState } from "react";
import { Dialog } from "./Protection";
import { FileTypeIcon } from "./FileTypeIcon";

// "Move to…": pick a folder from everything that exists, or make a new one.
export function MoveDialog({ folders, count, current, onMove, onClose }: { folders: string[]; count: number; current: string; onMove: (folder: string) => void; onClose: () => void }) {
  const [path, setPath] = useState("");
  const [newName, setNewName] = useState("");
  const list = useMemo(() => {
    const prefix = path ? path + "/" : "";
    const children = new Set<string>();
    for (const f of folders) {
      if (f === path || !f.startsWith(prefix)) continue;
      children.add(f.slice(prefix.length).split("/")[0]);
    }
    return [...children].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [folders, path]);
  const crumbs = path.split("/").filter(Boolean);
  const here = path === current;

  return (
    <Dialog title={`Move ${count === 1 ? "1 item" : `${count} items`}`} onClose={onClose}>
      <nav className="flex flex-wrap items-center gap-1 text-sm mb-2" aria-label="Folder path">
        <button className={`font-medium hover:underline ${!path ? "text-ink" : "text-ink-2"}`} onClick={() => setPath("")}>
          My drive
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-ink-3">/</span>
            <button className="hover:underline text-ink-2" onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}>
              {c}
            </button>
          </span>
        ))}
      </nav>
      <ul className="card max-h-64 overflow-y-auto divide-y divide-line" data-testid="move-folders">
        {list.map((name) => (
          <li key={name}>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-cream-2" onClick={() => setPath(path ? `${path}/${name}` : name)} onDoubleClick={() => onMove(path ? `${path}/${name}` : name)}>
              <FileTypeIcon kind="DIR" className="text-ink-2 size-6" />
              <span className="truncate">{name}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">No folders in here.</li>}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = newName.trim().replace(/\//g, " ");
          if (!n) return;
          setPath(path ? `${path}/${n}` : n);
          setNewName("");
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New folder here" className="flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-ink" aria-label="New folder name" />
        <button type="submit" className="btn-ghost border border-line text-sm py-2" disabled={!newName.trim()}>
          Add
        </button>
      </form>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => onMove(path)} disabled={here} data-testid="move-confirm">
          {here ? "Already here" : `Move to ${path ? crumbs[crumbs.length - 1] : "My drive"}`}
        </button>
      </div>
    </Dialog>
  );
}
