import { File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Presentation } from "lucide-react";

// File-type icons from Lucide, one stroke weight, so every row reads the same.
// `kind` comes from fileIcon() in lib/format.ts.
export function FileTypeIcon({ kind, className = "" }: { kind: string; className?: string }) {
  const props = { size: 22, strokeWidth: 1.6, "aria-hidden": true, className };
  switch (kind) {
    case "DIR":
      return <Folder {...props} fill="currentColor" fillOpacity={0.12} />;
    case "IMG":
      return <FileImage {...props} />;
    case "VID":
      return <FileVideo {...props} />;
    case "AUD":
      return <FileAudio {...props} />;
    case "XLS":
      return <FileSpreadsheet {...props} />;
    case "PPT":
      return <Presentation {...props} />;
    case "ZIP":
      return <FileArchive {...props} />;
    case "PDF":
    case "DOC":
    case "TXT":
      return <FileText {...props} />;
    default:
      return <File {...props} />;
  }
}
