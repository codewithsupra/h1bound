/**
 * Coordinates for the night map of UK, Irish and Dutch sponsors. Register cities are matched by
 * lowercase name; employers without a usable city (the Dutch and Irish registers list none) are
 * spread over their country's main cities by weight. [lon, lat]. Client-safe.
 */

export const EU_BOUNDS = { west: -10.6, east: 7.4, south: 49.9, north: 58.7 };

export const CITY_COORDS: Record<string, [number, number]> = {
  // UK
  london: [-0.13, 51.51], manchester: [-2.24, 53.48], birmingham: [-1.9, 52.49], leeds: [-1.55, 53.8], glasgow: [-4.25, 55.86],
  edinburgh: [-3.19, 55.95], bristol: [-2.59, 51.45], liverpool: [-2.98, 53.41], sheffield: [-1.47, 53.38], newcastle: [-1.61, 54.98],
  "newcastle upon tyne": [-1.61, 54.98], nottingham: [-1.15, 52.95], leicester: [-1.13, 52.64], coventry: [-1.51, 52.41], cardiff: [-3.18, 51.48],
  belfast: [-5.93, 54.6], aberdeen: [-2.09, 57.15], dundee: [-2.97, 56.46], cambridge: [0.12, 52.2], oxford: [-1.26, 51.75],
  reading: [-0.97, 51.45], southampton: [-1.4, 50.9], portsmouth: [-1.09, 50.8], brighton: [-0.14, 50.82], "milton keynes": [-0.76, 52.04],
  swindon: [-1.78, 51.56], slough: [-0.6, 51.51], luton: [-0.42, 51.88], watford: [-0.4, 51.66], guildford: [-0.57, 51.24],
  croydon: [-0.1, 51.38], ilford: [0.08, 51.56], harrow: [-0.34, 51.58], wembley: [-0.3, 51.55], hounslow: [-0.36, 51.47],
  romford: [0.18, 51.58], stratford: [0.0, 51.54], uxbridge: [-0.48, 51.55], stockport: [-2.16, 53.41], bolton: [-2.43, 53.58],
  bradford: [-1.75, 53.79], wolverhampton: [-2.13, 52.59], derby: [-1.48, 52.92], stoke: [-2.18, 53.0], "stoke-on-trent": [-2.18, 53.0],
  norwich: [1.3, 52.63], ipswich: [1.16, 52.06], exeter: [-3.53, 50.72], plymouth: [-4.14, 50.38], bournemouth: [-1.88, 50.72],
  bath: [-2.36, 51.38], gloucester: [-2.24, 51.86], cheltenham: [-2.08, 51.9], peterborough: [-0.24, 52.57], northampton: [-0.9, 52.24],
  york: [-1.08, 53.96], hull: [-0.33, 53.74], middlesbrough: [-1.23, 54.57], sunderland: [-1.38, 54.91], preston: [-2.7, 53.76],
  blackburn: [-2.48, 53.75], huddersfield: [-1.78, 53.65], wakefield: [-1.5, 53.68], doncaster: [-1.13, 53.52], lincoln: [-0.54, 53.23],
  chelmsford: [0.47, 51.74], colchester: [0.9, 51.89], southend: [0.71, 51.54], "southend-on-sea": [0.71, 51.54], maidstone: [0.52, 51.27],
  canterbury: [1.08, 51.28], crawley: [-0.19, 51.11], basingstoke: [-1.09, 51.27], swansea: [-3.94, 51.62], newport: [-3.0, 51.59],
  inverness: [-4.22, 57.48], stirling: [-3.94, 56.12], warrington: [-2.59, 53.39], "st albans": [-0.34, 51.75], "high wycombe": [-0.75, 51.63],
  // Ireland
  dublin: [-6.26, 53.35], cork: [-8.47, 51.9], galway: [-9.05, 53.27], limerick: [-8.63, 52.66], waterford: [-7.11, 52.26],
  // Netherlands
  amsterdam: [4.9, 52.37], rotterdam: [4.48, 51.92], "the hague": [4.3, 52.08], "den haag": [4.3, 52.08], utrecht: [5.12, 52.09],
  eindhoven: [5.48, 51.44], groningen: [6.57, 53.22], leiden: [4.49, 52.16], delft: [4.36, 52.01], haarlem: [4.64, 52.39],
  nijmegen: [5.85, 51.84], enschede: [6.89, 52.22], tilburg: [5.09, 51.56], breda: [4.78, 51.59], arnhem: [5.9, 51.98],
};

/** Where employers without a city go, weighted roughly by where international hires work. */
export const COUNTRY_METROS: Record<string, [string, number][]> = {
  GB: [["london", 8], ["manchester", 2], ["birmingham", 2], ["edinburgh", 1], ["glasgow", 1], ["bristol", 1], ["leeds", 1], ["cambridge", 1]],
  NL: [["amsterdam", 6], ["rotterdam", 2], ["the hague", 2], ["utrecht", 2], ["eindhoven", 2], ["groningen", 1], ["leiden", 1], ["delft", 1]],
  IE: [["dublin", 8], ["cork", 2], ["galway", 1], ["limerick", 1], ["waterford", 1]],
};

export const EU_LABELS: [string, number, number][] = [
  ["London", -0.13, 51.51], ["Manchester", -2.24, 53.48], ["Edinburgh", -3.19, 55.95], ["Birmingham", -1.9, 52.49],
  ["Dublin", -6.26, 53.35], ["Cork", -8.47, 51.9], ["Amsterdam", 4.9, 52.37], ["Rotterdam", 4.48, 51.92], ["Belfast", -5.93, 54.6],
];

/** Coordinates for one employer: its city if we know it, else a weighted metro of its country chosen by `r` in [0,1). */
export function locate(country: string, city: string | null, r: number): [number, number] | null {
  const known = city ? CITY_COORDS[city.toLowerCase().replace(/\s+/g, " ").trim()] : undefined;
  if (known) return known;
  const metros = COUNTRY_METROS[country];
  if (!metros) return null;
  const total = metros.reduce((a, [, w]) => a + w, 0);
  let pick = r * total;
  const hit = metros.find(([, w]) => (pick -= w) < 0) ?? metros[0];
  return CITY_COORDS[hit[0]];
}

/** Simplified coastlines, drawn faintly so the lights read as Britain, Ireland and the Netherlands. [lon, lat][]. */
export const OUTLINES: [number, number][][] = [
  // Great Britain, clockwise from Dunnet Head
  [[-3.37, 58.67], [-3.07, 58.64], [-3.09, 58.44], [-3.65, 58.12], [-4.0, 57.86], [-4.2, 57.52], [-3.87, 57.59], [-3.28, 57.72], [-2.0, 57.69],
    [-1.78, 57.5], [-2.08, 57.15], [-2.47, 56.71], [-2.97, 56.46], [-2.58, 56.28], [-3.19, 56.02], [-2.52, 56.0], [-2.0, 55.77], [-1.43, 55.0],
    [-1.2, 54.69], [-0.61, 54.49], [-0.4, 54.28], [-0.08, 54.12], [0.11, 53.58], [0.34, 53.14], [0.3, 52.9], [0.49, 52.94], [1.3, 52.93],
    [1.73, 52.6], [1.75, 52.48], [1.35, 51.96], [1.15, 51.79], [0.71, 51.53], [1.38, 51.39], [1.31, 51.13], [0.97, 50.91], [0.58, 50.85],
    [0.25, 50.74], [-0.14, 50.82], [-0.79, 50.73], [-1.09, 50.79], [-1.4, 50.85], [-1.88, 50.71], [-2.45, 50.52], [-2.94, 50.72], [-3.41, 50.62],
    [-3.64, 50.22], [-4.14, 50.36], [-5.2, 49.96], [-5.71, 50.07], [-5.48, 50.21], [-5.08, 50.42], [-4.53, 51.02], [-4.12, 51.21], [-3.47, 51.21],
    [-2.98, 51.35], [-2.7, 51.5], [-3.0, 51.55], [-3.17, 51.45], [-3.94, 51.6], [-4.3, 51.56], [-4.7, 51.67], [-5.3, 51.88], [-4.66, 52.1],
    [-4.08, 52.41], [-4.41, 52.89], [-4.78, 52.77], [-4.27, 53.14], [-4.63, 53.31], [-3.83, 53.32], [-3.05, 53.4], [-3.05, 53.82], [-2.86, 54.07],
    [-3.23, 54.11], [-3.64, 54.49], [-3.55, 54.64], [-3.2, 54.95], [-4.05, 54.83], [-4.86, 54.64], [-5.03, 54.9], [-4.86, 55.24], [-4.63, 55.46],
    [-4.75, 55.95], [-5.8, 55.29], [-5.47, 56.41], [-5.83, 57.0], [-5.71, 57.28], [-5.16, 57.9], [-5.0, 58.62], [-4.75, 58.57], [-3.52, 58.59]],
  // Ireland, clockwise from Malin Head
  [[-7.37, 55.38], [-7.0, 55.2], [-6.65, 55.2], [-6.15, 55.22], [-5.82, 54.85], [-5.9, 54.67], [-5.48, 54.5], [-5.55, 54.32], [-5.89, 54.21],
    [-6.2, 54.03], [-6.35, 53.98], [-6.25, 53.72], [-6.06, 53.37], [-6.0, 52.98], [-6.14, 52.8], [-6.36, 52.34], [-6.36, 52.17], [-7.0, 52.15],
    [-7.6, 52.08], [-7.85, 51.95], [-8.3, 51.8], [-8.5, 51.7], [-9.82, 51.45], [-9.6, 51.65], [-10.1, 51.75], [-10.35, 51.9], [-10.45, 52.12],
    [-9.9, 52.42], [-9.93, 52.56], [-9.43, 52.95], [-9.05, 53.25], [-10.23, 53.4], [-10.2, 53.95], [-10.0, 54.22], [-9.35, 54.32], [-8.6, 54.3],
    [-8.3, 54.6], [-8.78, 54.67], [-8.3, 55.15], [-7.63, 55.27]],
  // Netherlands
  [[3.38, 51.37], [3.57, 51.44], [3.43, 51.55], [3.9, 51.82], [4.12, 51.98], [4.27, 52.11], [4.43, 52.24], [4.57, 52.46], [4.76, 52.96],
    [5.1, 53.0], [5.42, 53.17], [6.2, 53.4], [6.93, 53.33], [7.2, 53.24], [7.07, 52.85], [7.06, 52.24], [6.1, 51.85], [6.2, 51.37], [5.7, 50.75],
    [5.0, 51.45], [4.75, 51.5], [4.25, 51.4]],
];
