import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  LocationPicker,
  placeToDestination,
  placeToOrigin,
  type Place,
} from "@/components/LocationPicker";
import { cn, focusRing } from "@/lib/cn";
import type { Granularity } from "@/lib/places";

const ALL_GRANULARITY: Granularity[] = [
  "address",
  "named-place",
  "city-state",
  "city-state-postal",
  "state",
];
const ALL_COUNTRIES = ["US", "CA"] as const;

/** Supported markets for live pickup/drop columns (order biases Places `regionCode` to the first). */
const DEMO_COUNTRIES: string[] = [...ALL_COUNTRIES];

/** Pickup prototype — maps to `placeToOrigin` (no `state` granularity). */
const PICKUP_GRANULARITY: Granularity[] = ["address", "city-state", "city-state-postal"];
const PICKUP_COUNTRIES = DEMO_COUNTRIES;

/** Drop prototype — maps to `placeToDestination` (multi + state allowed). */
const DROP_GRANULARITY: Granularity[] = ["state", "city-state", "city-state-postal"];
const DROP_COUNTRIES = DEMO_COUNTRIES;

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      (typeof document !== "undefined" && document.documentElement.classList.contains("dark"))
        ? "dark"
        : "light",
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("felix-theme", theme);
    } catch {
      /* localStorage may be blocked; non-fatal. */
    }
  }, [theme]);

  const [pickup, setPickup] = useState("");
  const [pickupDetails, setPickupDetails] = useState<Place | null>(null);
  const [drops, setDrops] = useState<Place[]>([]);

  const [pgGran, setPgGran] = useState<Record<Granularity, boolean>>({
    address: true,
    "named-place": false,
    "city-state": true,
    "city-state-postal": true,
    state: true,
  });
  const [pgCountries, setPgCountries] = useState<Record<string, boolean>>({
    US: true,
    CA: true,
  });
  const [pgMulti, setPgMulti] = useState(true);
  const [pgValue, setPgValue] = useState("");
  const [pgChips, setPgChips] = useState<Place[]>([]);

  const pgGranArr = useMemo(
    () => ALL_GRANULARITY.filter((k) => pgGran[k]),
    [pgGran],
  );
  const pgCountriesArr = useMemo(
    () => Object.entries(pgCountries).filter(([, v]) => v).map(([k]) => k),
    [pgCountries],
  );

  return (
    <div className="min-h-screen w-full">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="size-7 rounded-md bg-[var(--brand-mark)]" aria-hidden />
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-medium text-foreground">Felix</span>
            <span className="text-[11px] text-muted-foreground">
              Location Picker · test harness
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="Toggle theme"
          className={cn(
            "grid size-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            focusRing,
          )}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-8">
        <DataSourceBanner />

        <section className="flex flex-col gap-3">
          <Eyebrow>Live · two surfaces, one component</Eyebrow>
          <h2 className="text-[18px] font-semibold tracking-tight">
            Pickup origin · Drop destinations
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Same <Code>LocationPicker</Code>. Pickup uses <Code>multi=false</Code> with{" "}
            <Code>value</Code>/<Code>onChange</Code>/<Code>onSelect</Code>; drop uses{" "}
            <Code>multi=true</Code> with <Code>chips</Code>/<Code>onAdd</Code>/
            <Code>onRemove</Code>. Under each label, <Code>granularity</Code> and{" "}
            <Code>countries</Code> match the named constants in <Code>App.tsx</Code> (
            <Code>PICKUP_*</Code> / <Code>DROP_*</Code>). Both use{" "}
            <Code>DEMO_COUNTRIES</Code> (<Code>US</Code> + <Code>CA</Code>); the JSON echoes those
            props plus live state.
          </p>
          <div className="grid gap-6 rounded-xl border border-border bg-card p-6 md:grid-cols-2">
            <Field
              label="Pickup"
              hint={
                <>
                  <span className="block">
                    <Code>multi</Code>=<Code>false</Code> · <Code>value</Code>,{" "}
                    <Code>onChange</Code>, <Code>onSelect</Code> → then{" "}
                    <Code>placeToOrigin(place)</Code> when <Code>place.kind</Code> is{" "}
                    <Code>address</Code> or <Code>city</Code>
                  </span>
                  <span className="mt-1 block font-mono text-[10.5px] text-muted-foreground">
                    <Code>granularity</Code>={JSON.stringify(PICKUP_GRANULARITY)} ·{" "}
                    <Code>countries</Code>={JSON.stringify(PICKUP_COUNTRIES)}
                  </span>
                </>
              }
            >
              <LocationPicker
                granularity={PICKUP_GRANULARITY}
                countries={PICKUP_COUNTRIES}
                multi={false}
                value={pickup}
                onChange={setPickup}
                onSelect={setPickupDetails}
                placeholder="Search US/CA address, city, or postal code"
              />
              <StateBlock>
                {JSON.stringify(
                  {
                    locationPickerProps: {
                      multi: false,
                      granularity: PICKUP_GRANULARITY,
                      countries: PICKUP_COUNTRIES,
                      value: pickup,
                      handlers:
                        "onChange(string), onSelect(Place) after Places details resolve",
                      downstream:
                        "placeToOrigin(place) only when place.kind is address | city",
                    },
                    originPayload:
                      pickupDetails &&
                      (pickupDetails.kind === "address" || pickupDetails.kind === "city")
                        ? placeToOrigin(pickupDetails)
                        : null,
                  },
                  null,
                  2,
                )}
              </StateBlock>
            </Field>

            <Field
              label="Drop"
              hint={
                <>
                  <span className="block">
                    <Code>multi</Code>=<Code>true</Code> · <Code>chips</Code>,{" "}
                    <Code>onAdd</Code>, <Code>onRemove</Code> →{" "}
                    <Code>placeToDestination(place)</Code> per chip
                  </span>
                  <span className="mt-1 block font-mono text-[10.5px] text-muted-foreground">
                    <Code>granularity</Code>={JSON.stringify(DROP_GRANULARITY)} ·{" "}
                    <Code>countries</Code>={JSON.stringify(DROP_COUNTRIES)}
                  </span>
                </>
              }
            >
              <LocationPicker
                granularity={DROP_GRANULARITY}
                countries={DROP_COUNTRIES}
                multi={true}
                chips={drops}
                onAdd={(p) => setDrops((cs) => [...cs, p])}
                onRemove={(id) => setDrops((cs) => cs.filter((c) => c.id !== id))}
                placeholder="Add US/CA state, city, or postal code…"
              />
              <StateBlock>
                {JSON.stringify(
                  {
                    locationPickerProps: {
                      multi: true,
                      granularity: DROP_GRANULARITY,
                      countries: DROP_COUNTRIES,
                      chips: drops,
                      handlers: "onAdd(Place), onRemove(placeId)",
                      downstream: "drops.map(placeToDestination)",
                    },
                    destinationsPayload: drops.map(placeToDestination),
                  },
                  null,
                  2,
                )}
              </StateBlock>
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Eyebrow>Playground</Eyebrow>
          <h2 className="text-[18px] font-semibold tracking-tight">Try the props</h2>
          <p className="text-[13px] text-muted-foreground">
            Toggle <Code>granularity</Code>, <Code>countries</Code>, and <Code>multi</Code>.
            Turn on <Code>named-place</Code> for businesses and landmarks (e.g. Dock 5, Phoenix).
            The state object below shows what your <Code>onChange</Code> /{" "}
            <Code>onAdd</Code> handler would receive.
          </p>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap gap-6">
              <Group label="granularity">
                {ALL_GRANULARITY.map((k) => (
                  <Pill
                    key={k}
                    on={pgGran[k]}
                    onClick={() => setPgGran((g) => ({ ...g, [k]: !g[k] }))}
                  >
                    {k}
                  </Pill>
                ))}
              </Group>
              <Group label="countries">
                {ALL_COUNTRIES.map((k) => (
                  <Pill
                    key={k}
                    on={!!pgCountries[k]}
                    onClick={() =>
                      setPgCountries((c) => ({ ...c, [k]: !c[k] }))
                    }
                  >
                    {k}
                  </Pill>
                ))}
              </Group>
              <Group label="multi">
                <Pill on={!pgMulti} onClick={() => setPgMulti(false)}>
                  false
                </Pill>
                <Pill on={pgMulti} onClick={() => setPgMulti(true)}>
                  true
                </Pill>
              </Group>
            </div>

            {pgGranArr.length === 0 ? (
              <p className="text-[13px] text-destructive">
                Pick at least one granularity.
              </p>
            ) : (
              <div className="max-w-md">
                <LocationPicker
                  key={`${pgMulti}`}
                  granularity={pgGranArr}
                  countries={pgCountriesArr.length > 0 ? pgCountriesArr : ["US"]}
                  multi={pgMulti}
                  value={pgValue}
                  onChange={setPgValue}
                  chips={pgChips}
                  onAdd={(p) => setPgChips((cs) => [...cs, p])}
                  onRemove={(id) => setPgChips((cs) => cs.filter((c) => c.id !== id))}
                />
              </div>
            )}

            <StateBlock>
              {JSON.stringify(
                pgMulti
                  ? { chips: pgChips, asBackendPayload: tryEachPlaceToDestination(pgChips) }
                  : { value: pgValue },
                null,
                2,
              )}
            </StateBlock>
          </div>
        </section>

        <footer className="pb-6 pt-4 text-[11.5px] text-muted-foreground">
          API: <Code>/api/places/autocomplete</Code> ·{" "}
          <Code>/api/places/details</Code> — proxied through Vite middleware to
          Google Places (New). Set <Code>GOOGLE_MAPS_API_KEY</Code> in{" "}
          <Code>.env.local</Code>.
        </footer>
      </main>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">
      {children}
    </code>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        {hint != null ? (
          <div className="text-[11px] leading-snug text-muted-foreground [&_code]:text-[10.5px]">
            {hint}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function StateBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="m-0 max-h-40 overflow-auto rounded-md border border-border bg-[var(--subtle)] p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
      {children}
    </pre>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        on
          ? `rounded-md border border-primary bg-primary px-2.5 py-1 font-mono text-[12px] text-primary-foreground ${focusRing}`
          : `rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[12px] text-muted-foreground transition-colors hover:border-[color-mix(in_oklab,var(--foreground)_25%,var(--border))] hover:text-foreground ${focusRing}`
      }
    >
      {children}
    </button>
  );
}

function DataSourceBanner() {
  const [status, setStatus] = useState<"checking" | "live" | "missing-key" | "error">(
    "checking",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/places/autocomplete?q=da&regions=us,ca");
        if (cancelled) return;
        if (res.status === 503) {
          setStatus("missing-key");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          setErrorMsg(`HTTP ${res.status}`);
          return;
        }
        setStatus("live");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") return null;

  if (status === "live") {
    return (
      <Banner tone="live">
        <Dot tone="live" />
        <span>
          <strong className="text-foreground">Live —</strong> querying Google Places
          (New) through the Vite middleware proxy.
        </span>
      </Banner>
    );
  }
  if (status === "missing-key") {
    return (
      <Banner tone="warn">
        <Dot tone="warn" />
        <span>
          <strong className="text-foreground">No API key —</strong> set{" "}
          <Code>GOOGLE_MAPS_API_KEY</Code> in <Code>.env.local</Code> and restart{" "}
          <Code>npm run dev</Code>. The picker will still render, but no suggestions
          will load.
        </span>
      </Banner>
    );
  }
  return (
    <Banner tone="error">
      <Dot tone="error" />
      <span>
        <strong className="text-foreground">API error —</strong>{" "}
        {errorMsg ?? "Failed to reach /api/places/autocomplete"}.
      </span>
    </Banner>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "live" | "warn" | "error";
  children: React.ReactNode;
}) {
  const base =
    "flex items-center gap-2.5 rounded-md px-3.5 py-2.5 text-[12.5px] text-muted-foreground";
  return (
    <div
      className={
        tone === "error"
          ? `${base} border border-destructive/40 bg-card`
          : `${base} border border-border bg-[var(--subtle)]`
      }
    >
      {children}
    </div>
  );
}

function tryEachPlaceToDestination(places: Place[]) {
  return places.map((p) => {
    try {
      return placeToDestination(p);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        place: p,
      };
    }
  });
}

function Dot({ tone }: { tone: "live" | "warn" | "error" }) {
  const cls =
    tone === "live"
      ? "bg-[#16a34a] shadow-[0_0_0_3px_color-mix(in_oklab,#16a34a_22%,transparent)]"
      : tone === "warn"
        ? "bg-muted-foreground"
        : "bg-destructive shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_22%,transparent)]";
  return <span className={`size-2 flex-none rounded-full ${cls}`} aria-hidden />;
}
