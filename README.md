# Location picker prototype

Vite + React + TypeScript harness for a unified **Google Places (New)** location field: one `LocationPicker` for pickup (single select) and drop (multi-chip), with a playground to toggle props.

The dev server proxies `/api/places/*` so the browser never sees your API key—same pattern as a Next.js route handler.

## Quick start

```bash
cp .env.example .env.local
# Set GOOGLE_MAPS_API_KEY (Places API New enabled)

npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The banner reports whether the key and proxy are working.

```bash
npm run typecheck   # TypeScript
npm run build       # Production bundle
```

## Configuration

| File | Purpose |
|------|---------|
| `.env.local` | `GOOGLE_MAPS_API_KEY` (gitignored) |
| `.env.example` | Template only; safe to commit |

## Layout

| Path | Role |
|------|------|
| `src/components/LocationPicker.tsx` | Combobox UI, session tokens, commit flow |
| `src/lib/places.ts` | Zod wire types, suggestion classification, `Place` + `placeToOrigin` / `placeToDestination` |
| `src/lib/parsePrediction.ts` | Optional locality override when prediction text and resolved state/ZIP agree |
| `vite.config.ts` | `POST /api/places/autocomplete`, `GET /api/places/details` → Google |
| `src/App.tsx` | Pickup/drop demos (`PICKUP_*` / `DROP_*` constants document props) |

## `LocationPicker` props (summary)

- **`granularity`** — Allow-list: `address`, `named-place`, `city-state`, `city-state-postal`, `state`.
- **`countries`** — ISO 3166-1 alpha-2 codes (Places caps how many you can send).
- **`multi`** — `false`: `value`, `onChange`, `onSelect(place)`. `true`: `chips`, `onAdd`, `onRemove`.

Pickup in the demo omits `state` in granularity and maps resolved `Place` to **`placeToOrigin`**. Drop uses **`placeToDestination`** per chip.

## Porting

Replace the `fetch('/api/places/…')` calls in `src/lib/places.ts` with your app’s routes; keep the JSON shape expected by the Zod schemas. Move `LocationPicker` + `places.ts` (minus fetch URLs if you prefer) into the host app and point the details route at the same locality-hint behavior if you need USPS-aligned city labels.

## License

Private / internal prototype (`package.json` marks the package private).
