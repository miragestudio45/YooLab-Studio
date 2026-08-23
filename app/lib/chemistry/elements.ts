/**
 * Element data access.
 *
 * The 118-element table lives in `public/data/periodic-elements.json` rather
 * than in a module: it is 74 kB of data, the Library loads it only when someone
 * opens Chemistry, and keeping it out of the bundle means the homepage never
 * pays for it. Provenance and licence are recorded in THIRD_PARTY_ASSETS.md.
 */

export type CategoryKey =
  | 'alkali' | 'alkaline' | 'transition' | 'postTransition' | 'metalloid'
  | 'nonmetal' | 'halogen' | 'nobleGas' | 'lanthanide' | 'actinide' | 'unknown';

export type ElementData = {
  z: number;
  symbol: string;
  name: string;
  category: CategoryKey;
  period: number | null;
  group: number | null;
  xpos: number;
  ypos: number;
  phase: string | null;
  discoveredBy: string | null;
  yearDiscovered: string | null;
  mass: number | null;
  neutrons: number | null;
  shells: number[];
  ecFull: string | null;
  ecSemantic: string | null;
  electronegativity: number | null;
  ionizationEnergy: number | null;
  electronAffinity: number | null;
  oxidationStates: string | null;
  atomicRadius: number | null;
  covalentRadius: number | null;
  density: number | null;
  densityUnit: string | null;
  melt: number | null;
  boil: number | null;
  molarHeat: number | null;
  thermalConductivity: number | null;
  electricalConductivity: number | null;
  mohs: number | null;
  youngs: number | null;
};

/** Vietnamese group names, matching the wording used in the 2018 curriculum. */
export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  alkali: 'Kim loại kiềm',
  alkaline: 'Kim loại kiềm thổ',
  transition: 'Kim loại chuyển tiếp',
  postTransition: 'Kim loại sau chuyển tiếp',
  metalloid: 'Bán kim loại',
  nonmetal: 'Phi kim',
  halogen: 'Halogen',
  nobleGas: 'Khí hiếm',
  lanthanide: 'Họ Lantan',
  actinide: 'Họ Actini',
  unknown: 'Chưa xác định',
};

/**
 * Category colours, kept inside the warm palette.
 *
 * The reference implementation uses fully saturated primaries on black. On an
 * ivory panel that reads as a toy, so these are the same eleven hues pulled
 * toward the site's own range and held light enough for dark text to sit on top.
 */
export const CATEGORY_COLOR: Record<CategoryKey, string> = {
  alkali: '#e0705f',
  alkaline: '#e79a5c',
  transition: '#d9b45e',
  postTransition: '#8fae7a',
  metalloid: '#6fae9a',
  nonmetal: '#63a98c',
  halogen: '#6aa9bd',
  nobleGas: '#7d94c7',
  lanthanide: '#9a7cc4',
  actinide: '#c079ab',
  unknown: '#a89f9a',
};

/** Phase at standard conditions, in Vietnamese. */
export const PHASE_LABEL: Record<string, string> = {
  Solid: 'Rắn',
  Liquid: 'Lỏng',
  Gas: 'Khí',
};

/**
 * Vietnamese element names.
 *
 * The 2018 Vietnamese science curriculum uses IUPAC names, so most entries here
 * are the international name and are omitted; only the elements with an
 * established Vietnamese name carry one.
 */
export const VI_NAME: Record<string, string> = {
  H: 'Hydrogen', He: 'Helium', Li: 'Lithium', Be: 'Beryllium', B: 'Boron',
  C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', F: 'Fluorine', Ne: 'Neon',
  Na: 'Sodium (Natri)', Mg: 'Magnesium', Al: 'Aluminium (Nhôm)', Si: 'Silicon',
  P: 'Phosphorus', S: 'Sulfur (Lưu huỳnh)', Cl: 'Chlorine', Ar: 'Argon',
  K: 'Potassium (Kali)', Ca: 'Calcium', Sc: 'Scandium', Ti: 'Titanium',
  V: 'Vanadium', Cr: 'Chromium', Mn: 'Manganese', Fe: 'Iron (Sắt)',
  Co: 'Cobalt', Ni: 'Nickel', Cu: 'Copper (Đồng)', Zn: 'Zinc (Kẽm)',
  Ga: 'Gallium', Ge: 'Germanium', As: 'Arsenic (Asen)', Se: 'Selenium',
  Br: 'Bromine', Kr: 'Krypton', Rb: 'Rubidium', Sr: 'Strontium',
  Y: 'Yttrium', Zr: 'Zirconium', Nb: 'Niobium', Mo: 'Molybdenum',
  Tc: 'Technetium', Ru: 'Ruthenium', Rh: 'Rhodium', Pd: 'Palladium',
  Ag: 'Silver (Bạc)', Cd: 'Cadmium', In: 'Indium', Sn: 'Tin (Thiếc)',
  Sb: 'Antimony', Te: 'Tellurium', I: 'Iodine', Xe: 'Xenon',
  Cs: 'Caesium', Ba: 'Barium', W: 'Tungsten (Vonfram)', Pt: 'Platinum',
  Au: 'Gold (Vàng)', Hg: 'Mercury (Thuỷ ngân)', Tl: 'Thallium',
  Pb: 'Lead (Chì)', Bi: 'Bismuth', Po: 'Polonium', At: 'Astatine',
  Rn: 'Radon', Ra: 'Radium', Th: 'Thorium', U: 'Uranium', Pu: 'Plutonium',
};

type Payload = { _source?: string; elements: ElementData[] };

let cache: Promise<ElementData[]> | null = null;

/** Loads the table once per session. */
export function loadElements(): Promise<ElementData[]> {
  if (!cache) {
    cache = fetch('/data/periodic-elements.json')
      .then((response) => {
        if (!response.ok) throw new Error(`periodic-elements.json: ${response.status}`);
        return response.json() as Promise<Payload>;
      })
      .then((payload) => payload.elements)
      .catch((error) => {
        // Cleared so a transient failure can be retried by re-opening the
        // subject rather than being cached as an empty table for the session.
        cache = null;
        throw error;
      });
  }
  return cache;
}

export const formatNumber = (value: number | null | undefined, unit = '', digits = 3) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  const text = magnitude !== 0 && (magnitude < 0.001 || magnitude >= 100000)
    ? value.toExponential(2)
    : String(Number(value.toFixed(magnitude >= 100 ? 1 : digits)));
  return unit ? `${text} ${unit}` : text;
};

export const formatTemperature = (kelvin: number | null) => {
  if (kelvin === null || !Number.isFinite(kelvin)) return '—';
  return `${formatNumber(kelvin - 273.15, '°C', 1)}`;
};
