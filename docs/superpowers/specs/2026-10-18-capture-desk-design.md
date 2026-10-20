# Capture desk redesign

Date: 2026-10-18

The capture app becomes a two-view desk: a shelves hub and a shelf detail page. The pack `Note` shape and `personal-os.zip` export stay unchanged.

## Decisions

- Notes remain `{ id, title, shelf, tags, created, updated, body, path }` in `localStorage`. Word counts and byte sizes are derived from `body` at render time.
- Capture method is a reserved tag, `capture:text | capture:voice | capture:pdf | capture:clipboard`. The card shows it as a source chip and hides it from any other tag display. The zip keeps the tag because tags are already part of the note contract.
- Shelf description, color, and custom shelves are browser metadata under `personal-os.shelves.v1`. They are not written into the zip. A custom shelf’s slug is the pack `shelf` value (`slugifyTitle`). Default shelves cannot be deleted. A custom shelf can be deleted only when it has no notes.
- Storage stays `localStorage`. The storage card reports the real byte size of the ledger keys and is labeled local storage. There is no IndexedDB migration and no encryption.
- Header chrome: brand, “Saved in this browser”, Desk, Ledger, Audio Capture, and a ⋮ menu. Desk opens the hub. Ledger opens an index of every note. Audio Capture opens a dictation page that saves into a chosen shelf. The ⋮ menu holds Download pack, LLM settings, the storage reading, and Clear browser cache.
- Clear browser cache deletes notes and custom shelves in this app. LLM settings stay. A confirm modal explains that.
- Footer cards on a shelf show the shelf index, a static “System Level” prompt-injection label, and live storage. The privacy line says the desk is private, saved in this browser, and has no telemetry.
- Hash routes are `#/` and `#/shelf/<slug>`.
- Quick capture is one field on the open shelf. The first line, capped at 80 characters, becomes the title. Enter or Add saves. The microphone uses the Web Speech controller and leaves the text for review. Chrome often ends continuous recognition after silence; the controller starts a fresh session so longer conversations keep appending, and the UI turns Recording off if restart fails. PDF and text files fill the field and do not save by themselves. Audio files are not transcribed; the desk tells the person to use the microphone.
- Hub actions land on Preferences: Record voice focuses the microphone control, Upload reads the file in the click and opens the draft, Paste reads the clipboard in the click.
- Note cards support Edit, Copy note, Move shelf, and Delete. Delete uses a confirm modal.
- “Process with LLM” stays on the quick-capture bar so an existing configured key still works. It does not save.
- Empty shelves show the quick bar, an empty line, and the drop zone. The app does not seed sample notes.

## Out of scope

Prompt assembly, accounts, encryption, pack-format changes, and IndexedDB.
