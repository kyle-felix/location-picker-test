import { z } from "zod";

export const PlaceSuggestionSchema = z.object({
  placeId: z.string(),
  mainText: z.string(),
  secondaryText: z.string(),
  description: z.string(),
  types: z.array(z.string()).default([]),
});
export type PlaceSuggestion = z.infer<typeof PlaceSuggestionSchema>;

export const PlaceDetailsSchema = z.object({
  placeId: z.string(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  formattedAddress: z.string().nullable(),
  types: z.array(z.string()).default([]),
});
export type PlaceDetails = z.infer<typeof PlaceDetailsSchema>;

const AutocompleteResponseSchema = z.object({
  suggestions: z.array(PlaceSuggestionSchema),
});

export function newSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function fetchAutocomplete(
  q: string,
  opts: {
    sessionToken: string;
    regions: string[];
    signal?: AbortSignal;
    /** Second request for admin_area_level_1 (e.g. "ny" → New York state). */
    includeAdminAreas?: boolean;
  },
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    q,
    sessionToken: opts.sessionToken,
    regions: opts.regions.join(","),
  });
  if (opts.includeAdminAreas) params.set("includeAdminAreas", "1");
  const res = await fetch(`/api/places/autocomplete?${params.toString()}`, {
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`autocomplete HTTP ${res.status}`);
  const json = await res.json();
  const parsed = AutocompleteResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("invalid autocomplete response");
  return parsed.data.suggestions;
}

export async function fetchDetails(
  placeId: string,
  opts: {
    sessionToken: string;
    predictionDescription?: string;
    /** ISO country codes (e.g. us, ca) — biases Place Details `regionCode`. */
    regions?: string[];
    signal?: AbortSignal;
  },
): Promise<PlaceDetails> {
  const params = new URLSearchParams({
    placeId,
    sessionToken: opts.sessionToken,
  });
  if (opts.predictionDescription) {
    params.set("predictionDescription", opts.predictionDescription);
  }
  if (opts.regions?.length) {
    params.set("regions", opts.regions.map((c) => c.toLowerCase()).join(","));
  }
  const res = await fetch(`/api/places/details?${params.toString()}`, {
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`details HTTP ${res.status}`);
  const json = await res.json();
  const parsed = PlaceDetailsSchema.safeParse(json);
  if (!parsed.success) throw new Error("invalid details response");
  return parsed.data;
}

export type Granularity =
  | "address"
  | "named-place"
  | "city-state"
  | "city-state-postal"
  | "state";

export type SuggestionKind =
  | "address"
  | "named-place"
  | "city"
  | "state"
  | "postal";

const POI_TYPE_HINTS = new Set([
  "establishment",
  "point_of_interest",
  "tourist_attraction",
  "airport",
  "park",
  "museum",
  "restaurant",
  "food",
  "cafe",
  "bar",
  "store",
  "shopping_mall",
  "lodging",
  "gas_station",
  "gym",
  "spa",
  "zoo",
  "stadium",
  "movie_theater",
  "night_club",
  "train_station",
  "transit_station",
  "subway_station",
  "light_rail_station",
  "school",
  "university",
  "hospital",
  "church",
  "mosque",
  "synagogue",
  "hindu_temple",
  "post_office",
  "library",
  "amusement_park",
  "aquarium",
  "art_gallery",
  "bowling_alley",
  "casino",
  "cemetery",
  "event_venue",
]);

const STATE_TYPE_HINTS = new Set(["administrative_area_level_1"]);
const POSTAL_TYPE_HINTS = new Set(["postal_code", "postal_code_prefix"]);
const LOCALITY_CENTER_HINTS = new Set(["locality", "postal_town"]);
const CITY_TYPE_HINTS = new Set([
  "locality",
  "postal_town",
  "sublocality",
  "neighborhood",
  "administrative_area_level_2",
  "administrative_area_level_3",
]);
const ADDRESS_TYPE_HINTS = new Set(["street_address", "premise", "subpremise", "route"]);

function hasCountyOrSubregion(types: readonly string[]): boolean {
  return types.some((t) => t === "administrative_area_level_2" || t === "administrative_area_level_3");
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "nova scotia": "NS",
  "northwest territories": "NT",
  nunavut: "NU",
  ontario: "ON",
  "prince edward island": "PE",
  quebec: "QC",
  saskatchewan: "SK",
  yukon: "YT",
};

const ABBREV_TO_STATE_MAIN_TEXT: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, abbrev]) => [abbrev, name]),
);

export function stateCodeFromName(name: string): string {
  return STATE_NAME_TO_CODE[name.trim().toLowerCase()] ?? name.slice(0, 2).toUpperCase();
}

export function classifyTypes(types: readonly string[]): SuggestionKind {
  if (types.some((t) => POI_TYPE_HINTS.has(t))) return "named-place";
  if (types.some((t) => ADDRESS_TYPE_HINTS.has(t))) return "address";
  if (
    types.some((t) => STATE_TYPE_HINTS.has(t)) &&
    !types.some((t) => LOCALITY_CENTER_HINTS.has(t)) &&
    !types.some((t) => POSTAL_TYPE_HINTS.has(t)) &&
    !hasCountyOrSubregion(types)
  ) {
    return "state";
  }
  if (types.some((t) => CITY_TYPE_HINTS.has(t))) return "city";
  if (types.some((t) => POSTAL_TYPE_HINTS.has(t))) return "postal";
  if (types.some((t) => STATE_TYPE_HINTS.has(t))) return "state";
  return "address";
}

function stateSuggestionSortKey(s: PlaceSuggestion, queryTrimmed: string): number {
  const kind = classifyTypes(s.types);
  if (kind === "state") return 0;
  const q = queryTrimmed.trim();
  if (q.length === 2 && /^[a-z]{2}$/i.test(q)) {
    const target = ABBREV_TO_STATE_MAIN_TEXT[q.toUpperCase()];
    if (
      target &&
      s.mainText.trim().toLowerCase() === target &&
      s.types.includes("administrative_area_level_1") &&
      kind !== "postal"
    ) {
      return 0;
    }
  }
  return 1;
}

export function sortSuggestionsForDisplay(
  suggestions: PlaceSuggestion[],
  queryTrimmed: string,
): PlaceSuggestion[] {
  const keyed = suggestions.map((s, index) => ({
    s,
    index,
    k: stateSuggestionSortKey(s, queryTrimmed),
  }));
  keyed.sort((a, b) => (a.k !== b.k ? a.k - b.k : a.index - b.index));
  return keyed.map(({ s }) => s);
}

export function kindAllowed(kind: SuggestionKind, granularity: Granularity[]): boolean {
  const g = (x: Granularity) => granularity.includes(x);
  return (
    (kind === "address" && g("address")) ||
    (kind === "named-place" && g("named-place")) ||
    (kind === "city" && (g("city-state") || g("city-state-postal"))) ||
    (kind === "state" && g("state")) ||
    (kind === "postal" && g("city-state-postal"))
  );
}

export type CountryCode = "US" | "CA";

export type StatePlace = {
  kind: "state";
  id: string;
  country: CountryCode;
  state: string;
  label: string;
  code: string;
};

export type CityPlace = {
  kind: "city";
  id: string;
  country: CountryCode;
  state: string;
  city: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  label: string;
  code: string;
};

export type AddressPlace = {
  kind: "address";
  id: string;
  country: CountryCode;
  state: string;
  city: string;
  street: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  label: string;
  code: string;
  chipLabel?: string;
};

export type Place = StatePlace | CityPlace | AddressPlace;

export function stripCountrySuffix(s: string): string {
  return s.replace(/,?\s*(USA|United States|Canada|CAN|Mexico|MX)\s*$/i, "").trim();
}

function parseCountry(value: string | null | undefined): CountryCode | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  return v === "US" || v === "CA" ? v : null;
}

/** Returns `{ error }` when details cannot form a supported `Place`. */
export function placeFromDetails(
  d: PlaceDetails,
  suggestion: PlaceSuggestion,
): Place | { error: string } {
  const country = parseCountry(d.country);
  if (!country) {
    return {
      error: `${d.country ?? "Unknown country"} isn't supported — pick a US or Canadian place.`,
    };
  }

  const state = (d.state || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    return { error: "That place is missing state/province information." };
  }

  const label =
    stripCountrySuffix(d.formattedAddress ?? "") ||
    stripCountrySuffix(suggestion.description) ||
    suggestion.mainText;

  const suggestionKind = classifyTypes(
    d.types.length > 0 ? d.types : suggestion.types,
  );

  if (suggestionKind === "state") {
    return {
      kind: "state",
      id: d.placeId,
      country,
      state,
      label,
      code: stateCodeFromName(suggestion.mainText),
    };
  }

  if (d.latitude == null || d.longitude == null) {
    return {
      error: `Couldn't geocode "${label}". Pick a more specific suggestion.`,
    };
  }

  if (suggestionKind === "address" || suggestionKind === "named-place") {
    if (!d.city) {
      return {
        error:
          suggestionKind === "named-place"
            ? "That place is missing a city — pick a more specific suggestion."
            : "That address is missing a city — pick a more specific suggestion.",
      };
    }
    let street = d.street.trim();
    if (suggestionKind === "named-place" && !street) {
      street =
        suggestion.mainText.trim() ||
        stripCountrySuffix(label).split(",")[0]?.trim() ||
        label;
    }
    const venueChip =
      suggestionKind === "named-place" ? suggestion.mainText.trim() : undefined;
    return {
      kind: "address",
      id: d.placeId,
      country,
      state,
      city: d.city,
      street,
      postalCode: d.postalCode,
      latitude: d.latitude,
      longitude: d.longitude,
      label,
      code: label,
      ...(venueChip ? { chipLabel: venueChip } : {}),
    };
  }

  if (!d.city) {
    return { error: "That place is missing a city — pick a more specific suggestion." };
  }
  return {
    kind: "city",
    id: d.placeId,
    country,
    state,
    city: d.city,
    postalCode: d.postalCode,
    latitude: d.latitude,
    longitude: d.longitude,
    label,
    code: label,
  };
}

export type CapacityOrigin =
  | {
      type: "ADDRESS";
      originStreet: string;
      originCity: string;
      originState: string;
      originPostalCode: string | null;
      originLatitude: number;
      originLongitude: number;
    }
  | {
      type: "CITY_STATE";
      originStreet: null;
      originCity: string;
      originState: string;
      originPostalCode: null;
      originLatitude: number;
      originLongitude: number;
    }
  | {
      type: "CITY_STATE_POSTAL";
      originStreet: null;
      originCity: string;
      originState: string;
      originPostalCode: string;
      originLatitude: number;
      originLongitude: number;
    };

function cityPlaceToOrigin(p: CityPlace): CapacityOrigin {
  const { city, state, latitude, longitude, postalCode } = p;
  if (postalCode) {
    return {
      type: "CITY_STATE_POSTAL",
      originStreet: null,
      originCity: city,
      originState: state,
      originPostalCode: postalCode,
      originLatitude: latitude,
      originLongitude: longitude,
    };
  }
  return {
    type: "CITY_STATE",
    originStreet: null,
    originCity: city,
    originState: state,
    originPostalCode: null,
    originLatitude: latitude,
    originLongitude: longitude,
  };
}

export function placeToOrigin(p: Place): CapacityOrigin {
  if (p.kind === "address") {
    return {
      type: "ADDRESS",
      originStreet: p.street,
      originCity: p.city,
      originState: p.state,
      originPostalCode: p.postalCode,
      originLatitude: p.latitude,
      originLongitude: p.longitude,
    };
  }
  if (p.kind === "city") return cityPlaceToOrigin(p);
  throw new Error(
    `placeToOrigin does not support state-level pickup; got kind="state". Use city, address, or add a STATE pickup variant in your API.`,
  );
}

export type CapacityDestination =
  | { type: "STATE_PROVINCE"; country: CountryCode; state: string }
  | {
      type: "CITY_STATE";
      country: CountryCode;
      state: string;
      city: string;
      latitude: number;
      longitude: number;
    }
  | {
      type: "CITY_STATE_POSTAL";
      country: CountryCode;
      state: string;
      city: string;
      postalCode: string;
      latitude: number;
      longitude: number;
    };

export function placeToDestination(p: Place): CapacityDestination {
  if (p.kind === "state") {
    return { type: "STATE_PROVINCE", country: p.country, state: p.state };
  }
  if (p.kind === "address") {
    throw new Error(
      `placeToDestination doesn't accept address Places. Constrain the picker's granularity to exclude "address" for drop surfaces.`,
    );
  }
  if (p.postalCode) {
    return {
      type: "CITY_STATE_POSTAL",
      country: p.country,
      state: p.state,
      city: p.city,
      postalCode: p.postalCode,
      latitude: p.latitude,
      longitude: p.longitude,
    };
  }
  return {
    type: "CITY_STATE",
    country: p.country,
    state: p.state,
    city: p.city,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}
