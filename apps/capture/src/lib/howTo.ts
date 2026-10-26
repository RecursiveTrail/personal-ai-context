export type HowToSection = {
  title: string;
  steps: readonly string[];
};

export const HOW_TO_SECTIONS: readonly HowToSection[] = [
  {
    title: "What this desk stores",
    steps: [
      "Personal OS keeps your notes in this browser. Nothing here is uploaded. There is no account and no sync.",
      "The line under the title, Saved in this browser, means the notes stay on this device until you download a pack.",
      "Six shelves are already here: Preferences, Routines, AI collaboration, Goals, Work, and Personal. You can add your own.",
    ],
  },
  {
    title: "Move around",
    steps: [
      "Desk is the home page. It shows quick capture and the shelves.",
      "Ledger lists the notes. Audio Capture is a separate page for dictation.",
      "How to use is this page. Install guide, in the desk menu, explains how to point an assistant at a downloaded pack.",
      "Click Personal OS to return to the desk from any page.",
      "Open the desk menu with the button beside the Dark mode switch. It holds Download pack, Import plugin, Install guide, LLM settings, the storage reading, and Clear browser cache.",
    ],
  },
  {
    title: "Save a note on a shelf",
    steps: [
      "Open a shelf from the desk or the ledger.",
      "Type in Quick note. The first line becomes the title, shortened if it is longer than 80 characters.",
      "Press Enter to save. Shift+Enter starts a new line. Add does the same save.",
      "The note stays on that shelf. The field clears after a successful save.",
      "If the browser storage is full, the desk shows the error and does not pretend the note was saved.",
    ],
  },
  {
    title: "Capture from the desk",
    steps: [
      "Record voice opens Audio Capture.",
      "Upload PDF / Doc reads one PDF or text file and opens Preferences with that text in the note field. It is not saved yet.",
      "Paste text / Note reads the clipboard and opens Preferences with that text in the note field. An empty clipboard shows Clipboard is empty. If the browser denies clipboard access, paste into the field yourself.",
      "Save from the Preferences field with Enter or Add when the text is what you want to keep.",
    ],
  },
  {
    title: "Dictate",
    steps: [
      "On a shelf, use the microphone beside Add. On Audio Capture, choose the shelf, then press Record.",
      "Allow the microphone when the browser asks. Speech appears in the field. Press Stop, then save.",
      "Dictation uses this browser's speech recognition. If the browser cannot do that, the control stays unavailable and the page says so.",
      "You can also type on the Audio Capture page and save that text to the selected shelf.",
    ],
  },
  {
    title: "Add a PDF or text file",
    steps: [
      "On a shelf, use Attach file, or drop a PDF or text file on the drop zone. Plain text includes .txt, .md, and .markdown.",
      "The extracted text fills the note field. Dropping or attaching does not save. Press Enter or Add after you review it.",
      "Audio files are not transcribed in this browser. Use the microphone to dictate instead.",
      "A PDF the desk cannot read shows an error and leaves the saved notes unchanged.",
    ],
  },
  {
    title: "Clean a note with an LLM",
    steps: [
      "Open the desk menu and choose LLM settings. Pick OpenAI, OpenRouter, or a custom OpenAI-compatible host. Paste your own API key and model, then Save settings.",
      "The key stays in this browser. A request goes from this browser to the provider you chose. Reset returns the form to its defaults and saves those defaults.",
      "On a shelf, write or dictate first, then choose Process with LLM. The desk replaces the field with the cleaned text and tells you to review it.",
      "Processing does not save. Press Enter or Add after the text looks right. Without an API key, the desk asks you to add one first.",
    ],
  },
  {
    title: "Read the ledger",
    steps: [
      "Open Ledger. Each shelf shows its notes, or No notes yet.",
      "Search matches titles, note text, tags, shelf names, and shelf descriptions. A leading # is ignored, so a tag search works with or without it.",
      "Press Command-K on a Mac, or Ctrl-K on other keyboards, to focus the search.",
      "Filter with All shelves, Populated, Empty, or Recent edits. Recent edits means a note on that shelf was updated in the last 7 days.",
      "Download pack at the bottom downloads personal-os-plugin.zip. New shelf opens the same new-shelf form as the desk.",
    ],
  },
  {
    title: "Change a note",
    steps: [
      "On a shelf, Edit opens the title and body. Save the edit from that form.",
      "Copy note copies the title and body. The ledger has the same copy action on each note.",
      "Move shelf puts the note on another shelf.",
      "Delete asks you to confirm. Confirming removes the note from this browser. Download a pack first if you want a copy.",
    ],
  },
  {
    title: "Organize shelves",
    steps: [
      "New shelf asks for a name, an optional description, and a color. Creating it opens that shelf.",
      "Shelf options, then Edit details, changes the name, description, and color.",
      "The six built-in shelves cannot be deleted.",
      "A shelf you created can be deleted only when it has no notes. Move or delete its notes first.",
    ],
  },
  {
    title: "Choose light or dark",
    steps: [
      "Use the Dark mode switch in the top bar. The knob sits on the left for light and on the right for dark.",
      "The choice is saved in this browser and is restored on the next visit. The desk starts light and does not follow the operating system.",
      "Changing the color mode does not change notes, shelves, or LLM settings.",
    ],
  },
  {
    title: "Download a pack and bring it back",
    steps: [
      "Download pack, from the desk menu or the ledger, saves personal-os-plugin.zip. That file is the pack plus a local plugin for Claude Code, Cursor, and Codex or ChatGPT desktop.",
      "Import plugin asks for that zip, or an older pack-only zip. Read the summary, then Confirm merge. Cancel leaves this browser unchanged.",
      "A file that is not a pack is rejected and the current notes stay as they are.",
      "Open Install guide for the install commands. The steps are also listed at the bottom of this page.",
    ],
  },
  {
    title: "Clear this browser",
    steps: [
      "Clear browser cache asks you to confirm. Clear ledger deletes notes and custom shelves.",
      "It leaves LLM settings and the color mode. The six built-in shelves return empty.",
      "Download a pack first if you want those notes back later.",
    ],
  },
];
