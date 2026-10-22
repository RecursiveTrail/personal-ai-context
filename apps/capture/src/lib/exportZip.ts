import {
  buildManifest,
  serializeNote,
  serializeShelves,
  META_DIR,
  type Note,
  type PackShelf,
} from "@personal-os/pack-core";
import JSZip from "jszip";
import { PLUGIN_ZIP_NAME, PLUGIN_ZIP_ROOT, pluginFileEntries } from "./pluginFiles.js";

export async function buildPluginZip(
  notes: Note[],
  shelves: PackShelf[],
  serverSource: string
): Promise<Blob> {
  if (!serverSource.trim()) throw new Error("Bundled server is missing");
  const zip = new JSZip();
  const pack = `${PLUGIN_ZIP_ROOT}/plugin/personal-os`;
  for (const note of notes) zip.file(`${pack}/${note.path}`, serializeNote(note));
  for (const shelf of shelves) {
    const hasNote = notes.some((note) => note.shelf === shelf.slug);
    if (!hasNote) zip.file(`${pack}/${shelf.slug}/.keep`, "");
  }
  const shelfFile = shelves.map((shelf) => ({
    ...shelf,
    description: shelf.description.trim() || shelf.slug,
  }));
  zip.file(`${pack}/${META_DIR}/manifest.json`, JSON.stringify(buildManifest(notes), null, 2));
  zip.file(`${pack}/${META_DIR}/shelves.json`, serializeShelves(shelfFile));
  for (const entry of pluginFileEntries()) {
    zip.file(`${PLUGIN_ZIP_ROOT}/${entry.path}`, entry.text);
  }
  zip.file(`${PLUGIN_ZIP_ROOT}/plugin/server/server.js`, serverSource);
  return zip.generateAsync({ type: "blob" });
}

export function downloadPackZip(blob: Blob, filename = PLUGIN_ZIP_NAME) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
