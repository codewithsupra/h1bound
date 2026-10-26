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
