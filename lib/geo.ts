/** US state codes mentioned in a free-text job location ("Austin, Texas", "NYC", "Remote - CA"). */

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const CITIES: Record<string, string> = {
  "san francisco": "CA", "los angeles": "CA", "san jose": "CA", "san diego": "CA", "palo alto": "CA", "mountain view": "CA", "menlo park": "CA",
  sunnyvale: "CA", "san mateo": "CA", "bay area": "CA", seattle: "WA", bellevue: "WA", redmond: "WA", nyc: "NY", brooklyn: "NY",
  boston: "MA", cambridge: "MA", austin: "TX", dallas: "TX", houston: "TX", chicago: "IL", atlanta: "GA", denver: "CO", miami: "FL",
  pittsburgh: "PA", philadelphia: "PA", phoenix: "AZ", portland: "OR", "salt lake": "UT", detroit: "MI", minneapolis: "MN",
};
const CODES = new Set(Object.values(STATES));

export function statesIn(location: string): string[] {
  const out = new Set<string>();
  const l = location.toLowerCase();
  for (const [name, code] of Object.entries(STATES)) if (l.includes(name) && !(name === "washington" && /washington,? d\.?c/.test(l))) out.add(code);
  for (const [city, code] of Object.entries(CITIES)) if (l.includes(city)) out.add(code);
  for (const m of location.matchAll(/(?:,|\s-|\()\s*([A-Z]{2})\b/g)) if (CODES.has(m[1])) out.add(m[1]);
  if (/washington,? d\.?c/.test(l)) out.add("DC");
  return [...out];
}

/**
 * Countries a free-text job location points at, for the markets we match outside the US:
 * "London, UK" → ["GB"], "Amsterdam or Dublin" → ["NL", "IE"], "Cambridge, MA" → ["US"].
 */
// Country words always win; city names lose to a US state code ("Dublin, OH", "Birmingham, AL", "Manchester, NH").
const COUNTRY_WORDS: [string, RegExp][] = [
  ["GB", /\b(united kingdom|uk|u\.k\.|great britain|britain|england|scotland|wales|northern ireland)\b/i],
  ["NL", /\b(the netherlands|netherlands|holland|nederland)\b/i],
  ["IE", /\b((?<!northern\s)ireland|éire)\b/i],
];
const CITY_WORDS: [string, RegExp][] = [
  ["GB", /\b(london|manchester|birmingham|edinburgh|glasgow|bristol|leeds|oxford|belfast|cardiff|newcastle upon tyne|liverpool|sheffield|nottingham|aberdeen|milton keynes|southampton|leicester|coventry|guildford|brighton)\b/i],
  ["NL", /\b(amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven|groningen|leiden|delft|haarlem|amstelveen|hoofddorp|schiphol|nijmegen|enschede|tilburg|breda|arnhem)\b/i],
  ["IE", /\b(dublin|cork|galway|limerick|waterford|kilkenny|athlone|dundalk)\b/i],
];

export function countriesIn(location: string): string[] {
  const strong = COUNTRY_WORDS.filter(([, re]) => re.test(location)).map(([c]) => c);
  if (strong.length) return strong;
  const us = statesIn(location).length > 0;
  const cities = CITY_WORDS.filter(([, re]) => re.test(location)).map(([c]) => c);
  if (cities.length && !us) return cities;
  return us ? ["US"] : [];
}

export type RemoteScope = "anywhere" | "europe" | "country" | "us" | "unknown";

/** Where a remote job can be done from. A remote role limited to one country shows that country in countriesIn. */
export function remoteScope(location: string): RemoteScope {
  const l = location.toLowerCase();
  if (/\b(anywhere|worldwide|global(ly)?|international|any location|all countries)\b/.test(l)) return "anywhere";
  if (countriesIn(location).some((c) => c !== "US")) return "country";
  if (/\b(europe|european|emea|eu|eea|cet|cest|gmt|western europe)\b/.test(l)) return "europe";
  if (/\b(us|usa|united states|north america|americas)\b/.test(l) || statesIn(location).length) return "us";
  return "unknown";
}
