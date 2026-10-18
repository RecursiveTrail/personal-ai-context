# Developer Handover Specification: Personal OS Capture (v1.0)

## 1. Product Overview & Core Philosophy
**Personal OS Capture** is a local-first, privacy-respecting private desktop notebook designed for a single user to curate guidelines, preferences, routines, and goals that can be easily fed into AI assistants or exported.

### Core Non-Negotiables:
- **Zero Cloud / Zero Telemetry:** Everything is stored exclusively in client-side storage (`IndexedDB` or `localStorage`). No external servers, no user accounts, no analytics tracking.
- **Single-File / Local Desk:** Packaged as an offline-first Single Page App (React/Vite or Vanilla TS/Tailwind).
- **Export & Portability:** Single-click full backup download producing `personal-os.zip` containing human-readable Markdown/YAML files for each note categorized by shelf folder.

---

## 2. Design System & Tokens

### Palette
| Token Name | Hex Code | Usage |
| :--- | :--- | :--- |
| `canvas` | `#fff8f5` (or `#f6f3ee`) | Page / desk background |
| `surface` | `#ffffff` | Primary cards, modals, dropdowns |
| `surface-low` | `#faf2ee` | Hover states, pill active backgrounds |
| `surface-container` | `#f4ece8` | Secondary container fill, input borders |
| `ink` | `#1e1b19` | Primary headings, note bodies, titles |
| `ink-muted` | `#3e4948` | Field labels, excerpts, hints |
| `outline` | `#6e7979` | Metadata lines, word counts, secondary icons |
| `outline-variant` | `#bec9c8` | Subtle card dividers, input borders |
| `line` | `#e7e2da` | Standard 1px card and table borders |
| `primary` | `#0f6e6e` | Active shelf accent, primary CTAs |
| `primary-hover` | `#005454` | Primary button hover / active states |
| `danger` | `#8f2d2d` | Destructive actions, delete modal button (never bright neon red) |

### Typography
- **Headings & Product Title:** `Newsreader` (or system serif fallback: `Iowan Old Style`, `Palatino`, `Georgia`, `serif`). Used for brand `Personal OS`, shelf title, and modal headlines.
- **UI & Note Content:** `Source Sans 3` (or `Source Sans Pro`, `system-ui`, `sans-serif`). Used for all labels, buttons, note inputs, excerpts, and metadata.
- **Scale:** Base 16px body, 14px secondary/hints, 12px uppercase category tags, 22px–28px display headings.

### Geometry & Shadows
- **Card Border Radius:** `12px` (`rounded-xl`).
- **Input & Button Radius:** `8px` (`rounded-lg`).
- **Pill Badges:** `9999px` (`rounded-full`).
- **Card Shadow:** `0 2px 8px rgba(28, 25, 23, 0.06)`. No heavy or neon drop shadows.

---

## 3. Screen Views & UX Architecture

### Screen 1: Shelves Hub & Quick Capture (Main Dashboard)
1. **Persistent Header:**
   - Left: `Personal OS` (Newsreader) + subtitle *"Saved in this browser"*.
   - Navigation status indicator (*"Desk Workspace"* / *"Local IndexedDB: Sync Paused"*).
   - Right: Context Menu trigger (`⋮` icon button).
   - **Context Menu Popover:**
     - **Download pack:** Initiates export of `personal-os.zip`. Subtitle *"Downloads personal-os.zip"*.
     - **LLM settings:** Opens local/API model preferences modal.
     - **Storage meter:** E.g. *"Storage: 14 KB used"* + *"Clear browser cache"*.
2. **Quick Capture Action Strip (Replaces bulky upfront form):**
   - Headline: *"Quick Capture — feed your personal intelligence ledger"*.
   - Three quick-entry action triggers:
     - `[Record voice]` (Badge: `LIVE DICTATION` / Microphone icon) -> Triggers Web Speech API / MediaRecorder.
     - `[Upload PDF / Doc]` (Badge: `EXTRACTS TEXT` / File upload icon) -> Triggers client-side PDF/text parser.
     - `[Paste text / Note]` (Clipboard icon) -> Reads clipboard or opens instant text snippet drawer.
3. **Shelves Grid:**
   - Section header: *"Shelves (4 default, N custom)"* + `[+ New Shelf]` primary button.
   - **Default Shelves:**
     1. `Preferences`: How you like things done, communication style, brevity rules. (Tags: `#concise`, `#formatting`, `#tone`).
     2. `AI collaboration`: Protocols for how assistants interact, verify code, and avoid hallucination. (Tags: `#guardrails`, `#git`, `#safety`).
     3. `Goals`: Active deliverables, milestones, finished targets. (Tags: `#ship-v1`, `#mcp`, `#q4`).
     4. `Routines`: Daily anchors, review cadences, scheduling protocols.
   - **Custom Shelf Creation Modal:**
     - Fields: *Shelf Name* (Input), *Description* (Textarea), *Color Accent Tag* (Radio swatch palette).
     - Actions: `Discard` (secondary) and `Create shelf` (primary teal).
   - **Interactivity:** Clicking any shelf card navigates to the Shelf Detail view.

### Screen 2: Shelf Detail & Notes View
1. **Breadcrumb & Header:**
   - `← All Shelves` return link.
   - Hierarchy tag (e.g., `Shelf 03 / Instruction & Protocol`).
   - Title: E.g., `Preferences` with description subtitle.
   - Status badge: *"N notes · Updated today · N words"*.
   - Actions: `[Shelf options ▾]` and `[+ Add note to shelf]`.
2. **In-Shelf Quick Capture Bar:**
   - Inline text field placeholder: *"Quick note for [Shelf Name]... Press Enter or capture audio"*.
   - Inline action buttons: Microphone, Attachment, `Add`.
3. **Note Cards:**
   - Note header: Directive index (e.g., `Directive 01 · Active Rule`), action buttons (`Edit`, `Copy note`, `Move shelf`, `Delete`).
   - Note title: Bold serif/sans title.
   - Note content: Full markdown or formatted quote card.
   - Note footer: Created date, updated date, capture method tag (`Voice memo transcript`, `Text paste`, `PDF extraction`), word/byte count.
4. **Drag & Drop Target:**
   - Ambient drop zone: *"Drop audio recordings, PDFs, or paste text to append to this shelf"*.

### Screen 3: System States & Error Handlers
- **Recording State:** Microphone button turns solid teal `Stop` button; status text *"Listening… Review the text before saving."*; live transcript populates the note field.
- **Delete Confirmation Modal:** Overlay modal asking *"Delete this note?"* / *"This removes it permanently from this browser ledger and cannot be undone without a backup pack."* with `Cancel` and `Delete Note` (`#8f2d2d`).
- **Quota Exceeded / Browser Warning:** Banner notification *"Browser ledger capacity full. Export the archive pack to safely delete older entries."* + disabled `Record` button when microphone permissions are denied.

---

## 4. Technical Implementation & Data Schema

### Data Types (TypeScript Definitions)
```typescript
export interface Note {
  id: string;
  shelfId: string;
  title: string;
  content: string;
  sourceType: 'text' | 'voice' | 'pdf' | 'clipboard';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  wordCount: number;
  byteSize: number;
  tags?: string[];
}

export interface Shelf {
  id: string;
  name: string;
  description: string;
  colorAccent: string; // Hex code
  isDefault: boolean;
  order: number;
}

export interface ExportPayload {
  version: '1.0';
  exportedAt: string;
  shelves: Shelf[];
  notes: Note[];
}
Storage & Export Requirements:
Use idb-keyval or native IndexedDB for high reliability across browser restarts.
The Download pack handler must use jszip (or similar) to construct personal-os.zip structured as:
personal-os/
├── manifest.json
├── Preferences/
│   ├── prefer-short-answers.md
│   └── communication-tone.md
├── AI-collaboration/
│   └── confirm-before-push.md
└── Goals/
    └── ship-v1.md

***

### Summary of what was provided:
1. **Design System & Tokens:** Exact color palette, font pairings (`Newsreader` + `Source Sans 3`), spacing scale, and radius/shadow values.
2. **Screen-by-screen Architecture:** Header popover menu specs, the new Quick Capture strip, the Shelves Grid with pre-defined/custom shelves, the Shelf Detail screen, and problem/modal states.
3. **Data Schema & Export Pipeline:** Clean TypeScript interfaces for `Note`, `Shelf`, and the `JSZip` export structure.