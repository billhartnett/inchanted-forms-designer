import { getAcordDictionaryEntries } from "shared/acord";

const codeToCategory = new Map<string, string>();
const categoryToCodes = new Map<string, string[]>();
let loaded = false;

function normalizeText(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveCategoryFromCode(acordCode: string): string {
  const code = String(acordCode || "").trim();
  if (code.includes("_")) {
    return code.split("_")[0] || "General";
  }
  if (code.includes(".")) {
    return code.split(".")[0] || "General";
  }
  return "General";
}

function loadOnce(): void {
  if (loaded) {
    return;
  }

  const entries = getAcordDictionaryEntries();

  for (const entry of entries) {
    const code = String(entry.acordCode || "").trim();
    if (!code) {
      continue;
    }

    const category = deriveCategoryFromCode(code);
    codeToCategory.set(code, category);

    const current = categoryToCodes.get(category) || [];
    current.push(code);
    categoryToCodes.set(category, current);
  }

  for (const [category, values] of categoryToCodes.entries()) {
    const deduped = Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
    categoryToCodes.set(category, deduped);
  }

  loaded = true;
}

export function getCategoryForAcordCode(acordCode: string): string | undefined {
  loadOnce();
  const normalizedInput = normalizeText(acordCode);

  for (const [code, category] of codeToCategory.entries()) {
    if (normalizeText(code) === normalizedInput) {
      return category;
    }
  }

  return undefined;
}

export function getAcordCodesForCategory(
  category: string,
  allowedCodes?: ReadonlySet<string>,
): Set<string> {
  loadOnce();
  const codes = categoryToCodes.get(String(category || "").trim()) || [];
  if (!allowedCodes || allowedCodes.size === 0) {
    return new Set(codes);
  }

  return new Set(codes.filter((code) => allowedCodes.has(code)));
}

export function isTaxonomyLoaded(): boolean {
  loadOnce();
  return codeToCategory.size > 0;
}
