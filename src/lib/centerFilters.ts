export const CENTER_FILTER_ALL = "__ALL__";

export const COMPANY_SIZE_OPTIONS = [
  { value: "small", label: "Small (~10 agents)" },
  { value: "medium", label: "Medium (~20-30 agents)" },
  { value: "large", label: "Large (40+ agents)" },
] as const;

export type CompanySizeValue = (typeof COMPANY_SIZE_OPTIONS)[number]["value"];

export const getCountryFromCenterLocation = (location: string | null | undefined) => {
  const cleaned = String(location ?? "").trim();
  if (!cleaned) return "";

  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts[parts.length - 1] ?? cleaned;
};

export const getCompanySizeFromAgentCount = (
  numberOfAgents: string | number | null | undefined,
): CompanySizeValue | "" => {
  const text = String(numberOfAgents ?? "").trim();
  if (!text) return "";

  const numbers = text.match(/\d+/g)?.map((value) => Number.parseInt(value, 10)) ?? [];
  const agentCount = numbers.filter(Number.isFinite).sort((a, b) => b - a)[0];

  if (!agentCount) return "";
  if (agentCount <= 10) return "small";
  if (agentCount < 40) return "medium";
  return "large";
};

export const buildCountryOptions = (
  rows: Array<{ location?: string | null; center_country?: string | null }>,
) => {
  const countries = new Set<string>();

  rows.forEach((row) => {
    const country = row.center_country || getCountryFromCenterLocation(row.location);
    if (country) countries.add(country);
  });

  return Array.from(countries).sort((a, b) => a.localeCompare(b));
};
