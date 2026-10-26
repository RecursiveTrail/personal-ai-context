import type { Note } from "@personal-os/pack-core";
import { PlusIcon } from "./Icons.js";
import { CAPTURE_FILE_ACCEPT } from "../lib/ingestFile.js";
import { SUGGESTED_TAGS, type ShelfRecord } from "../store/shelvesStore.js";

type ShelvesHubProps = {
  shelves: ShelfRecord[];
  notes: Note[];
  onOpen: (slug: string) => void;
  onCreate: () => void;
  onRecord: () => void;
  onUpload: (file: File) => void;
  onPaste: () => void;
};

export function ShelvesHub({
  shelves,
  notes,
  onOpen,
  onCreate,
  onRecord,
  onUpload,
  onPaste,
}: ShelvesHubProps) {
  const defaultCount = shelves.filter((shelf) => shelf.isDefault).length;
  const customCount = shelves.filter((shelf) => !shelf.isDefault).length;
  const countLabel =
    customCount === 0
      ? `${defaultCount} default`
      : `${defaultCount} default, ${customCount} custom`;

  return (
    <div className="hub">
      <section className="hubHero" aria-labelledby="quick-capture-heading">
        <p className="eyebrow">Local desk</p>
        <h2 id="quick-capture-heading">Quick capture</h2>
        <p>Feed your personal intelligence ledger.</p>
        <div className="hubActions">
          <button type="button" className="hubAction" onClick={onRecord}>
            <span>Record voice</span>
            <span className="hubBadge">Live dictation</span>
          </button>
          <label className="hubAction">
            <span>Upload PDF / Doc</span>
            <span className="hubBadge">Extracts text</span>
            <input
              className="fileInput"
              type="file"
              accept={CAPTURE_FILE_ACCEPT}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onUpload(file);
              }}
            />
          </label>
          <button type="button" className="hubAction" onClick={onPaste}>
            <span>Paste text / Note</span>
            <span className="hubBadge">Clipboard</span>
          </button>
        </div>
      </section>

      <section className="shelfSection" aria-labelledby="shelves-heading">
        <div className="sectionHead">
          <h2 id="shelves-heading">
            Shelves <span>{countLabel}</span>
          </h2>
          <button type="button" className="buttonPrimary" onClick={onCreate}>
            <PlusIcon />
            <span>New shelf</span>
          </button>
        </div>
        <div className="shelfGrid">
          {shelves.map((shelf) => {
            const count = notes.filter((note) => note.shelf === shelf.slug).length;
            const tags = SUGGESTED_TAGS[shelf.slug] ?? [];
            return (
              <button
                key={shelf.slug}
                type="button"
                className="shelfCard"
                data-shelf={shelf.slug}
                onClick={() => onOpen(shelf.slug)}
              >
                <span className="shelfStripe" style={{ background: shelf.color }} />
                <span className="shelfCardName">{shelf.name}</span>
                <span className="shelfCardDescription">{shelf.description}</span>
                {tags.length > 0 ? (
                  <span className="tagRow">
                    {tags.map((tag) => (
                      <span key={tag} className="tag">
                        #{tag}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="shelfCardCount">
                  {count} {count === 1 ? "note" : "notes"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
