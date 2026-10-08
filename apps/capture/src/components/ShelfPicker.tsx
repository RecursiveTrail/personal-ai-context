import { shelfChoices } from "../display.js";

type ShelfPickerProps = {
  name: string;
  value: string;
  onChange: (shelf: string) => void;
  labelId: string;
  compact?: boolean;
};

export function ShelfPicker({
  name,
  value,
  onChange,
  labelId,
  compact = false,
}: ShelfPickerProps) {
  return (
    <div
      className={compact ? "shelfPicker shelfPickerCompact" : "shelfPicker"}
      role="radiogroup"
      aria-labelledby={labelId}
    >
      {shelfChoices(value).map((choice) => {
        const selected = choice.id === value;
        return (
          <label
            key={choice.id}
            className={selected ? "shelfOption isSelected" : "shelfOption"}
          >
            <span className="shelfOptionCopy">
              <span className="shelfOptionLabel">{choice.label}</span>
              {choice.description ? (
                <span className="shelfOptionHint">{choice.description}</span>
              ) : null}
            </span>
            <input
              type="radio"
              name={name}
              value={choice.id}
              checked={selected}
              onChange={() => onChange(choice.id)}
            />
          </label>
        );
      })}
    </div>
  );
}
