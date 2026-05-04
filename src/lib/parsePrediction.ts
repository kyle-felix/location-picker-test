/**
 * Override Google's `locality` with the city from the user's prediction when
 * state + ZIP match — avoids centroid mismatches (e.g. unincorporated vs USPS city).
 * Pure functions; shared by Vite middleware and tests.
 */

export type LocalityHint = {
  city: string;
  state: string;
  zip: string | null;
};

/** Two-part "City, ST" / "City, ST ZIP" predictions; null for streets or other shapes. */
function stripTrailingCountry(s: string): string {
  return s
    .replace(/,?\s*(USA|United States|Canada|CAN)\s*$/i, "")
    .trim();
}

/** US "City, ST" / "City, ST ZIP" or CA "City, ON" / "City, ON A1A 1A1". */
export function parseUsTwoPartLocalityPrediction(
  description: string,
): LocalityHint | null {
  const trimmed = stripTrailingCountry(description.trim());
  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const [left, right] = parts;
  if (!left || !right) return null;
  if (/^\d/.test(left)) return null;

  const m = right.match(/^([A-Za-z]{2})(?:\s+(.+))?$/);
  if (!m || !m[1]) return null;
  const rest = m[2]?.trim();
  let zip: string | null = null;
  if (rest) {
    if (/^\d{5}(-\d{4})?$/.test(rest)) zip = rest;
    else if (/^[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$/i.test(rest)) {
      zip = rest.replace(/\s+/g, "").toUpperCase();
    }
  }
  return {
    city: left,
    state: m[1].toUpperCase(),
    zip,
  };
}

export function zip5(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

function normalizePostalKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const c = value.replace(/\s/g, "").toUpperCase();
  if (/^\d/.test(c)) {
    const z = zip5(value);
    return z ?? null;
  }
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(c)) return c.slice(0, 6);
  return c;
}

/** True if either side lacks a postal, or both normalize to the same key (US or CA). */
function postalCodesCompatible(
  hintZip: string | null,
  resolved: string | null | undefined,
): boolean {
  const h = normalizePostalKey(hintZip);
  const r = normalizePostalKey(resolved ?? null);
  if (!h || !r) return true;
  return h === r;
}

/** Null if Google resolution should stand; else patched city + formatted line. */
export function applyLocalityHint(opts: {
  predictionDescription: string | null | undefined;
  resolvedState: string;
  resolvedPostalCode: string | null;
}): { city: string; formattedAddress: string } | null {
  if (!opts.predictionDescription) return null;
  const hint = parseUsTwoPartLocalityPrediction(opts.predictionDescription);
  if (!hint) return null;

  const stateOk = opts.resolvedState.toUpperCase() === hint.state;
  const zipOk = postalCodesCompatible(hint.zip, opts.resolvedPostalCode);
  if (!stateOk || !zipOk) return null;

  const formattedAddress = stripTrailingCountry(opts.predictionDescription.trim());
  return { city: hint.city, formattedAddress };
}
