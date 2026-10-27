export type HowToFlowStep = {
  label: string;
  detail: string;
};

export const HOW_TO_SUMMARY =
  "Personal OS is a local desk for notes that tell your assistants how you like to work. Capture stays in this browser. Download a pack when you want an assistant to use it.";

export const HOW_TO_FLOW: readonly HowToFlowStep[] = [
  {
    label: "Capture",
    detail: "Type, dictate, paste, or drop a PDF or text file onto a shelf.",
  },
  {
    label: "Shelves",
    detail: "Keep notes in Preferences, Goals, Work, and the other shelves.",
  },
  {
    label: "Download pack",
    detail: "Export personal-os-plugin.zip from the desk menu.",
  },
  {
    label: "Use in an assistant",
    detail: "Install that zip in Claude Code, Cursor, or Codex / ChatGPT desktop.",
  },
];

export const HOW_TO_POINTS: readonly string[] = [
  "Nothing is uploaded. Notes stay in this browser until you download a pack.",
  "Open a shelf to add notes. Ledger is the index of everything saved here.",
  "Use Install guide in the desk menu for the assistant install steps.",
  "Clear browser cache removes notes and custom shelves. Settings stay.",
];
