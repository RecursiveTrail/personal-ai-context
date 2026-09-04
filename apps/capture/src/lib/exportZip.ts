import JSZip from "jszip";
import {
  buildManifest,
  serializeNote,
  PACK_ROOT_NAME,
  META_DIR,
  type Note,
} from "@personal-os/pack-core";

export async function buildPackZip(notes: Note[]): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(PACK_ROOT_NAME)!;
  for (const note of notes) {
    root.file(note.path, serializeNote(note));
  }
  root.folder(META_DIR)!.file(
    "manifest.json",
    JSON.stringify(buildManifest(notes), null, 2)
  );
  return zip.generateAsync({ type: "blob" });
}

export function downloadPackZip(blob: Blob, filename = "personal-os.zip") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
