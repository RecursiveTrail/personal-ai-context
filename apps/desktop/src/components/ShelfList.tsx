type Props = {
  shelves: string[];
  selected: string | null;
  onSelect: (shelf: string | null) => void;
};

export function ShelfList({ shelves, selected, onSelect }: Props) {
  return (
    <nav className="shelves" aria-label="Shelves">
      <h2>Shelves</h2>
      <ul>
        <li>
          <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)}>
            All notes
          </button>
        </li>
        {shelves.map((shelf) => (
          <li key={shelf}>
            <button type="button" aria-pressed={selected === shelf} onClick={() => onSelect(shelf)}>
              {shelf}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
