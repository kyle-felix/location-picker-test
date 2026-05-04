import {
  Building2,
  Check,
  Hash,
  Home,
  Landmark,
  Map as MapIcon,
  MapPin,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn, focusRing } from "@/lib/cn";
import {
  classifyTypes,
  fetchAutocomplete,
  fetchDetails,
  kindAllowed,
  newSessionToken,
  placeFromDetails,
  sortSuggestionsForDisplay,
  stripCountrySuffix,
  type Granularity,
  type Place,
  type PlaceSuggestion,
  type SuggestionKind,
} from "@/lib/places";

export type { CapacityDestination, CapacityOrigin, Place } from "@/lib/places";
export { placeToDestination, placeToOrigin } from "@/lib/places";

const DEFAULT_GRANULARITY: Granularity[] = [
  "address",
  "city-state",
  "city-state-postal",
  "state",
];

export type LocationPickerProps = {
  granularity?: Granularity[];
  countries?: string[];
  multi?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSelect?: (place: Place) => void;
  chips?: Place[];
  onAdd?: (place: Place) => void;
  onRemove?: (id: string) => void;
  placeholder?: string;
  invalid?: boolean;
  errorId?: string;
  ariaLabel?: string;
  onBlur?: () => void;
};

const KIND_ICON: Record<SuggestionKind, typeof MapPin> = {
  address: Home,
  "named-place": Landmark,
  city: Building2,
  state: MapIcon,
  postal: Hash,
};

const PLACE_KIND_ICON: Record<Place["kind"], typeof MapPin> = {
  address: Home,
  city: Building2,
  state: MapIcon,
};

const COMPOSITE_AREA = "City + state + postal code";

function kindSublabel(suggestion: PlaceSuggestion, kind: SuggestionKind): string {
  if (kind === "address") return "Street address";
  if (kind === "named-place") return "Business or landmark";
  if (kind === "state") return "Entire state";
  if (kind === "postal") {
    return suggestionLooksLikeCityStatePostal(suggestion) ? COMPOSITE_AREA : "Postal code";
  }
  return suggestionLooksLikeCityStatePostal(suggestion) ? COMPOSITE_AREA : "City or area";
}

function suggestionLooksLikeCityStatePostal(s: PlaceSuggestion): boolean {
  if (s.types.includes("postal_code") || s.types.includes("postal_code_prefix")) {
    if (!s.types.some((t) => t === "locality" || t === "postal_town")) return false;
  }
  return /\b\d{5}\b/.test(`${s.mainText} ${s.secondaryText} ${s.description}`);
}

function formatRowLabel(s: PlaceSuggestion): string {
  const stripped = stripCountrySuffix(s.description);
  return stripped || s.mainText;
}

export function LocationPicker({
  granularity = DEFAULT_GRANULARITY,
  countries = ["US", "CA"],
  multi = false,
  value = "",
  onChange,
  onSelect,
  chips = [],
  onAdd,
  onRemove,
  placeholder,
  invalid = false,
  errorId,
  ariaLabel,
  onBlur,
}: LocationPickerProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  /** After commit, skip one fetch so parent-driven `value` doesn't re-query. */
  const skipFetchRef = useRef(false);
  const sessionTokenRef = useRef<string>(newSessionToken());
  const abortRef = useRef<AbortController | null>(null);
  const blurTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const queryString = multi ? draft : value;

  useEffect(() => {
    if (multi) return;
    if (selectedPlace && selectedPlace.label !== value) {
      setSelectedPlace(null);
    }
  }, [multi, value, selectedPlace]);

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    const trimmed = queryString.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const t = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = await fetchAutocomplete(trimmed, {
          sessionToken: sessionTokenRef.current,
          regions: countries.map((c) => c.toLowerCase()),
          signal: controller.signal,
          includeAdminAreas: granularity.includes("state"),
        });
        const filtered = sortSuggestionsForDisplay(
          raw.filter((s) => kindAllowed(classifyTypes(s.types), granularity)),
          trimmed,
        );
        setSuggestions(filtered);
        setActiveIdx(filtered.length > 0 ? 0 : -1);
        setOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
        setError(err instanceof Error ? err.message : "Failed to load suggestions");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [queryString, granularity, countries]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const commit = useCallback(
    async (suggestion: PlaceSuggestion) => {
      try {
        const details = await fetchDetails(suggestion.placeId, {
          sessionToken: sessionTokenRef.current,
          predictionDescription: suggestion.description,
          regions: countries.map((c) => c.toLowerCase()),
        });
        sessionTokenRef.current = newSessionToken();
        const result = placeFromDetails(details, suggestion);

        if ("error" in result) {
          setError(result.error);
          return;
        }
        const place = result;

        if (multi) {
          if (chips.some((c) => c.id === place.id)) {
            setDraft("");
            setOpen(false);
            return;
          }
          onAdd?.(place);
          setDraft("");
          setSuggestions([]);
          setOpen(false);
        } else {
          skipFetchRef.current = true;
          setSelectedPlace(place);
          onChange?.(place.label);
          onSelect?.(place);
          setSuggestions([]);
          setOpen(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve place");
      }
    },
    [multi, chips, countries, onAdd, onChange, onSelect],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && multi && draft === "" && chips.length > 0) {
      e.preventDefault();
      onRemove?.(chips[chips.length - 1].id);
      return;
    }
    if (!open || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      const target = suggestions[activeIdx];
      if (target) {
        e.preventDefault();
        void commit(target);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setOpen(true);
    if (multi) {
      setDraft(v);
    } else {
      onChange?.(v);
    }
  }

  function clearSingle() {
    setSelectedPlace(null);
    onChange?.("");
    setSuggestions([]);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const LeadingIcon =
    multi ? MapPin : selectedPlace ? PLACE_KIND_ICON[selectedPlace.kind] : Search;

  const resolvedPlaceholder =
    placeholder ?? defaultPlaceholder(granularity, multi);

  const showPopover = open && (suggestions.length > 0 || queryString.length > 0 || loading);

  return (
    <div ref={containerRef} className="relative">
      <label
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-2 rounded-[8px] border bg-card px-2.5 py-1",
          "transition-[border-color,box-shadow] focus-within:border-ring",
          "focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)]",
          invalid
            ? "border-destructive focus-within:border-destructive focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_18%,transparent)]"
            : "border-input",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <LeadingIcon className="size-3.5 flex-none text-muted-foreground" aria-hidden />

        {multi
          ? chips.map((c) => (
              <Chip
                key={c.id}
                place={c}
                onRemove={() => onRemove?.(c.id)}
              />
            ))
          : null}

        <input
          ref={inputRef}
          value={multi ? draft : value}
          placeholder={multi && chips.length > 0 ? "" : resolvedPlaceholder}
          role="combobox"
          aria-expanded={showPopover}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
          }
          aria-label={ariaLabel ?? "Location"}
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            onBlur?.();
            blurTimer.current = window.setTimeout(() => setOpen(false), 160);
          }}
          autoComplete="off"
          spellCheck={false}
          className="h-[26px] min-w-[100px] flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-[color-mix(in_oklab,var(--muted-foreground)_85%,transparent)]"
        />

        {!multi && value ? (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearSingle}
            className={cn(
              "grid size-5 flex-none place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
              focusRing,
            )}
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </label>

      {showPopover ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-[320px] w-full overflow-auto rounded-[8px] border border-border bg-popover p-1 shadow-md"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-[12.5px] text-muted-foreground">Searching…</li>
          ) : error ? (
            <li className="px-3 py-2 text-[12.5px] text-destructive">{error}</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 text-[12.5px] text-muted-foreground">
              No matches. Try a city, two-letter state/province code, or postal code.
            </li>
          ) : (
            suggestions.map((s, idx) => (
              <ResultRow
                key={s.placeId}
                id={`${listboxId}-opt-${idx}`}
                suggestion={s}
                active={idx === activeIdx}
                disabled={multi && chips.some((c) => c.id === s.placeId)}
                selected={!multi && selectedPlace?.id === s.placeId}
                onMouseEnter={() => setActiveIdx(idx)}
                onCommit={() => void commit(s)}
                query={queryString}
              />
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function ResultRow({
  id,
  suggestion,
  active,
  disabled,
  selected,
  onMouseEnter,
  onCommit,
  query,
}: {
  id: string;
  suggestion: PlaceSuggestion;
  active: boolean;
  disabled: boolean;
  selected: boolean;
  onMouseEnter: () => void;
  onCommit: () => void;
  query: string;
}) {
  const kind = classifyTypes(suggestion.types);
  const sublabel = disabled
    ? "Already added"
    : kindSublabel(suggestion, kind);
  const rowLabel = formatRowLabel(suggestion);
  const KindIcon = KIND_ICON[kind];

  return (
    <li id={id} role="option" aria-selected={active} aria-disabled={disabled || undefined}>
      <button
        type="button"
        data-suggestion="true"
        disabled={disabled}
        onMouseEnter={disabled ? undefined : onMouseEnter}
        onMouseDown={(e) => {
          e.preventDefault();
          if (!disabled) onCommit();
        }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left",
          focusRing,
          disabled
            ? "cursor-not-allowed text-muted-foreground"
            : active
              ? "bg-accent text-accent-foreground"
              : "text-foreground hover:bg-accent",
        )}
      >
        <span className="grid size-[22px] flex-none place-items-center text-muted-foreground">
          <KindIcon className="size-[15px]" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span
            className={cn(
              "truncate text-[13px] font-normal",
              disabled && "line-through",
            )}
          >
            {highlight(rowLabel, query)}
          </span>
          <span className="truncate text-[11.5px] text-muted-foreground">
            {sublabel}
          </span>
        </span>
        {selected ? (
          <span className="flex-none text-foreground">
            <Check className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </button>
    </li>
  );
}

function chipDisplayText(place: Place): string {
  if (place.kind === "state") return place.code;
  if (place.kind === "address" && place.chipLabel) return place.chipLabel;
  return place.label;
}

function Chip({ place, onRemove }: { place: Place; onRemove: () => void }) {
  const display = chipDisplayText(place);
  const title =
    place.kind === "address" && place.chipLabel && place.label !== display
      ? place.label
      : undefined;
  return (
    <span
      className="inline-flex h-6 items-center gap-0.5 rounded-[5px] border border-border bg-secondary py-0.5 pl-2 pr-0.5 text-secondary-foreground"
      title={title}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="max-w-[200px] truncate text-[12.5px] font-medium leading-none">
        {display}
      </span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${display}`}
        className={cn(
          "grid size-[18px] flex-none place-items-center rounded text-muted-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:text-foreground",
          focusRing,
        )}
      >
        <X className="size-2.5" aria-hidden />
      </button>
    </span>
  );
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function defaultPlaceholder(granularity: Granularity[], multi: boolean): string {
  const has = (k: Granularity) => granularity.includes(k);
  const parts: string[] = [];
  if (has("address")) parts.push("address");
  if (has("named-place")) parts.push("place name");
  if (has("city-state") || has("city-state-postal")) parts.push("city");
  if (has("state")) parts.push("state");
  if (has("city-state-postal")) parts.push("postal code");
  if (parts.length === 0) return multi ? "Add a location…" : "Search…";
  const joined =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " or " + parts[parts.length - 1];
  return multi ? `Add ${joined}…` : `Search ${joined}`;
}
