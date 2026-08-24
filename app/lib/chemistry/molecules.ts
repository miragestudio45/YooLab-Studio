/**
 * Molecular geometry for the Library's molecule viewer.
 *
 * Coordinates are in Ångström and come from standard bond lengths and bond
 * angles, so they are measurements rather than art direction: the whole point of
 * the "Đo" tool in the viewer is that the number it reads off the model is the
 * number in the textbook. Anything that would break that — rounding a tetrahedral
 * angle to something that looks nicer, scaling a molecule to fit a frame — is
 * done in the camera, never in this file.
 *
 * The coordinate tables and the CPK colour/radius convention are adapted from
 * CloudyLo001's Compound Visualization (MIT); see the `credits` field on every
 * molecule entry in `app/lib/library/subjects/chemistry.ts`. Two things are
 * deliberately different from that source:
 *
 *   - Water and ammonia are re-derived from the textbook pairs (104.5° / 0.958 Å
 *     and 107.8° / 1.012 Å) instead of transcribed. The source's rounded
 *     coordinates measure 0.957 Å and 106.7°, and a viewer that contradicts the
 *     fact card printed next to it is worse than no viewer.
 *   - Methyl hydrogens and the rock-salt block are generated here rather than
 *     hand-listed. Nine hydrogens placed by hand is nine chances to be wrong,
 *     and a lattice is a rule, not a table.
 */

export type MoleculeAtom = { element: string; x: number; y: number; z: number };

/** `a` and `b` index into `Molecule.atoms`; `order` is 1, 2 or 3. */
export type MoleculeBond = { a: number; b: number; order: number };

export type Molecule = {
  id: string;
  /** IUPAC / international name, as the 2018 curriculum uses it. */
  name: string;
  nameVi: string;
  formula: string;
  category: string;
  atoms: MoleculeAtom[];
  bonds: MoleculeBond[];
  /** Molar mass in g/mol. */
  formulaWeight?: number;
  geometry: string;
  bondAngle?: string;
  /**
   * True when the model is a fragment of a crystal lattice rather than a
   * molecule. The viewer needs to know: it swaps in ionic radii for the
   * space-filling mode and it has to stop calling the contacts "liên kết".
   */
  isLattice?: boolean;
};

export type ElementRender = {
  /** Sphere colour. */
  color: string;
  /** Covalent radius, Å — drives the ball-and-stick and wireframe spheres. */
  covalent: number;
  /** Van der Waals radius, Å — drives the space-filling spheres. */
  vdw: number;
  /**
   * Ionic radius, Å. Only carried for ions that actually appear in a lattice
   * here, because it is the radius that makes rock salt readable: Na⁺ 1.02 plus
   * Cl⁻ 1.81 is 2.83 Å, which is the Na–Cl distance, so the ions touch exactly.
   * Using van der Waals radii instead (2.27 + 1.75 against a 2.82 Å spacing)
   * fuses the whole block into one lump and teaches the opposite of the truth.
   */
  ionic?: number;
};

/**
 * Element appearance, keyed by symbol.
 *
 * The radii are the standard Cordero covalent and Bondi van der Waals values.
 * The colours are the Jmol CPK convention pulled into the site's own range, the
 * same adjustment `CATEGORY_COLOR` makes in `elements.ts`: Jmol puts hydrogen at
 * pure white and oxygen at pure red, and on an ivory panel the first one
 * disappears and the second one is the loudest thing on the page. Hue is kept —
 * hydrogen still reads pale, oxygen red, nitrogen blue, chlorine green, sodium
 * violet, carbon graphite — so the model still matches every other chemistry
 * diagram a student has seen.
 *
 * Only the elements the bundled molecules use are listed. Adding a molecule with
 * a new element means adding its row here.
 */
export const ELEMENT_RENDER: Record<string, ElementRender> = {
  H: { color: '#e9dfd3', covalent: 0.31, vdw: 1.2 },
  C: { color: '#5b545e', covalent: 0.76, vdw: 1.7 },
  N: { color: '#6a80c4', covalent: 0.71, vdw: 1.55 },
  O: { color: '#d1604f', covalent: 0.66, vdw: 1.52 },
  Na: { color: '#9d7ec8', covalent: 1.66, vdw: 2.27, ionic: 1.02 },
  Cl: { color: '#74ab6f', covalent: 1.02, vdw: 1.75, ionic: 1.81 },
};

/** Used only if a molecule names an element with no row above. */
const FALLBACK_RENDER: ElementRender = { color: '#a89f9a', covalent: 0.75, vdw: 1.6 };

export const elementRender = (symbol: string): ElementRender =>
  ELEMENT_RENDER[symbol] ?? FALLBACK_RENDER;

/* ========================================================================== */
/* Geometry helpers                                                           */
/* ========================================================================== */

type Vec = { x: number; y: number; z: number };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (a: Vec): Vec => {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};

/**
 * Places the three hydrogens of a methyl group.
 *
 * The C–H directions each make 109.47° with the C→anchor bond, which means they
 * sit on a cone whose axis points away from the anchor with cos = 1/3 along it
 * and sin = 2√2/3 across it. `phase` rotates the three around that cone; the
 * default puts one hydrogen in the plane spanned by the axis and the reference
 * vector, which for a methyl on a flat ring is the plane of the ring — the
 * staggered conformation the 2D drawing implies.
 */
function addMethylHydrogens(
  atoms: MoleculeAtom[],
  bonds: MoleculeBond[],
  carbon: number,
  anchor: number,
  bondLength = 1.09,
): void {
  const centre = atoms[carbon];
  const axis = unit(sub(centre, atoms[anchor]));
  // Any vector not parallel to the axis works as the reference for the cone.
  const reference: Vec = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const across = unit(cross(axis, reference));
  const alsoAcross = cross(axis, across);
  const along = 1 / 3;
  const radial = (Math.SQRT2 * 2) / 3;

  for (let step = 0; step < 3; step += 1) {
    const angle = (Math.PI * 2 * step) / 3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const direction = unit({
      x: axis.x * along + (across.x * cos + alsoAcross.x * sin) * radial,
      y: axis.y * along + (across.y * cos + alsoAcross.y * sin) * radial,
      z: axis.z * along + (across.z * cos + alsoAcross.z * sin) * radial,
    });
    atoms.push({
      element: 'H',
      x: centre.x + direction.x * bondLength,
      y: centre.y + direction.y * bondLength,
      z: centre.z + direction.z * bondLength,
    });
    bonds.push({ a: carbon, b: atoms.length - 1, order: 1 });
  }
}

/**
 * Builds a block of the rock-salt structure.
 *
 * Rock salt is two interpenetrating face-centred cubic lattices, which is much
 * easier to see than to say: on a simple cubic grid of spacing a/2, an ion is
 * sodium when its three indices sum to an even number and chloride when they sum
 * to odd. `cells` counts unit cells per edge, so `cells = 1` gives the 3 × 3 × 3
 * block of 27 ions that shows every ion of one kind surrounded by six of the
 * other. The contacts returned as `bonds` are ionic neighbours, not covalent
 * bonds — the viewer says so.
 */
function buildRockSalt(latticeConstant: number, cells: number) {
  const step = latticeConstant / 2;
  const span = cells * 2;
  const half = span / 2;
  const stride = span + 1;
  const at = (i: number, j: number, k: number) => (i * stride + j) * stride + k;

  const atoms: MoleculeAtom[] = [];
  for (let i = 0; i <= span; i += 1) {
    for (let j = 0; j <= span; j += 1) {
      for (let k = 0; k <= span; k += 1) {
        atoms.push({
          element: (i + j + k) % 2 === 0 ? 'Na' : 'Cl',
          x: (i - half) * step,
          y: (j - half) * step,
          z: (k - half) * step,
        });
      }
    }
  }

  const bonds: MoleculeBond[] = [];
  for (let i = 0; i <= span; i += 1) {
    for (let j = 0; j <= span; j += 1) {
      for (let k = 0; k <= span; k += 1) {
        if (i < span) bonds.push({ a: at(i, j, k), b: at(i + 1, j, k), order: 1 });
        if (j < span) bonds.push({ a: at(i, j, k), b: at(i, j + 1, k), order: 1 });
        if (k < span) bonds.push({ a: at(i, j, k), b: at(i, j, k + 1), order: 1 });
      }
    }
  }

  return { atoms, bonds };
}

/**
 * Caffeine: a purine skeleton with three methyl groups.
 *
 * The ring atoms are laid out flat in z = 0 on a 1.40 Å hexagon and pentagon,
 * which is what a conjugated fused ring system really is — the delocalised
 * electrons hold every ring atom in one plane. The nine methyl hydrogens are the
 * only atoms with a z component, so switching a student from the 2D drawing to
 * this model shows exactly one new thing, which is the right amount.
 */
function buildCaffeine() {
  const atoms: MoleculeAtom[] = [
    { element: 'N', x: -1.34, y: 0.72, z: 0 },    // 0  N1
    { element: 'C', x: -1.34, y: -0.68, z: 0 },   // 1  C2
    { element: 'N', x: -0.13, y: -1.38, z: 0 },   // 2  N3
    { element: 'C', x: 1.08, y: -0.68, z: 0 },    // 3  C4
    { element: 'C', x: 1.08, y: 0.72, z: 0 },     // 4  C5
    { element: 'C', x: -0.13, y: 1.42, z: 0 },    // 5  C6
    { element: 'N', x: 2.42, y: 1.13, z: 0 },     // 6  N7
    { element: 'C', x: 3.24, y: 0.02, z: 0 },     // 7  C8
    { element: 'N', x: 2.42, y: -1.09, z: 0 },    // 8  N9
    { element: 'O', x: -2.39, y: -1.29, z: 0 },   // 9  O on C2
    { element: 'O', x: -0.13, y: 2.64, z: 0 },    // 10 O on C6
    { element: 'C', x: -2.65, y: 1.4, z: 0 },     // 11 methyl on N1
    { element: 'C', x: -0.13, y: -2.85, z: 0 },   // 12 methyl on N3
    { element: 'C', x: 3.72, y: 1.88, z: 0 },     // 13 methyl on N7
    { element: 'H', x: 4.32, y: 0.02, z: 0 },     // 14 H on C8
  ];
  const bonds: MoleculeBond[] = [
    { a: 0, b: 1, order: 1 },
    { a: 1, b: 2, order: 1 },
    { a: 2, b: 3, order: 1 },
    { a: 3, b: 4, order: 2 },
    { a: 4, b: 5, order: 1 },
    { a: 5, b: 0, order: 1 },
    { a: 4, b: 6, order: 1 },
    { a: 6, b: 7, order: 1 },
    { a: 7, b: 8, order: 2 },
    { a: 8, b: 3, order: 1 },
    { a: 1, b: 9, order: 2 },
    { a: 5, b: 10, order: 2 },
    { a: 0, b: 11, order: 1 },
    { a: 2, b: 12, order: 1 },
    { a: 6, b: 13, order: 1 },
    { a: 7, b: 14, order: 1 },
  ];
  addMethylHydrogens(atoms, bonds, 11, 0);
  addMethylHydrogens(atoms, bonds, 12, 2);
  addMethylHydrogens(atoms, bonds, 13, 6);
  return { atoms, bonds };
}

/* ========================================================================== */
/* The molecules                                                              */
/* ========================================================================== */

/**
 * Water teaches that a formula is not a shape. H₂O looks symmetrical written
 * down, and the two lone pairs on oxygen squeeze the two O–H bonds to 104.5°,
 * which is why the molecule has a negative end and a positive end at all.
 */
const water: Molecule = {
  id: 'nuoc',
  name: 'Water',
  nameVi: 'Nước',
  formula: 'H₂O',
  category: 'Hợp chất vô cơ',
  geometry: 'Gấp khúc (dạng góc)',
  bondAngle: '104.5°',
  formulaWeight: 18.02,
  // Four decimals, not three: at three the model measures 0.957 Å and the
  // "Đo" tool would disagree with the fact card beside it.
  atoms: [
    { element: 'O', x: 0, y: 0, z: 0 },
    { element: 'H', x: 0.7574, y: 0.5867, z: 0 },
    { element: 'H', x: -0.7574, y: 0.5867, z: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1 },
    { a: 0, b: 2, order: 1 },
  ],
};

/**
 * Carbon dioxide is the counter-example water needs. Both C=O bonds are polar,
 * and because the molecule is straight the two pulls are exactly opposite and
 * cancel — a molecule of polar bonds that is not itself polar.
 */
const carbonDioxide: Molecule = {
  id: 'carbon-dioxide',
  name: 'Carbon dioxide',
  nameVi: 'Carbon dioxide',
  formula: 'CO₂',
  category: 'Hợp chất vô cơ',
  geometry: 'Thẳng',
  bondAngle: '180°',
  formulaWeight: 44.01,
  atoms: [
    { element: 'C', x: 0, y: 0, z: 0 },
    { element: 'O', x: 1.16, y: 0, z: 0 },
    { element: 'O', x: -1.16, y: 0, z: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 2 },
    { a: 0, b: 2, order: 2 },
  ],
};

/**
 * Oxygen is the simplest case there is: two identical atoms, so nothing pulls
 * the shared electrons either way. It is also where the double bond can be
 * measured against a single one — 1.21 Å here against 1.48 Å in a peroxide.
 */
const dioxygen: Molecule = {
  id: 'oxi',
  name: 'Oxygen',
  nameVi: 'Oxi',
  formula: 'O₂',
  category: 'Đơn chất',
  geometry: 'Thẳng — phân tử hai nguyên tử',
  formulaWeight: 32.0,
  atoms: [
    { element: 'O', x: -0.605, y: 0, z: 0 },
    { element: 'O', x: 0.605, y: 0, z: 0 },
  ],
  bonds: [{ a: 0, b: 1, order: 2 }],
};

/**
 * Methane is the reason a molecule viewer beats a blackboard. Drawn flat, CH₄
 * looks like a cross with four 90° angles; in space the four bonds push as far
 * apart as they can get and land at 109.5°, which is the tetrahedron every
 * organic structure after this one is built from.
 */
const methane: Molecule = {
  id: 'metan',
  name: 'Methane',
  nameVi: 'Methane',
  formula: 'CH₄',
  category: 'Hợp chất hữu cơ',
  geometry: 'Tứ diện',
  bondAngle: '109.5°',
  formulaWeight: 16.04,
  atoms: [
    { element: 'C', x: 0, y: 0, z: 0 },
    { element: 'H', x: 0.629, y: 0.629, z: 0.629 },
    { element: 'H', x: 0.629, y: -0.629, z: -0.629 },
    { element: 'H', x: -0.629, y: 0.629, z: -0.629 },
    { element: 'H', x: -0.629, y: -0.629, z: 0.629 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1 },
    { a: 0, b: 2, order: 1 },
    { a: 0, b: 3, order: 1 },
    { a: 0, b: 4, order: 1 },
  ],
};

/**
 * Ammonia is methane with one bond replaced by a lone pair, and the model shows
 * what that costs: the pair takes more room than a bond, so the pyramid closes
 * from 109.5° to 107.8°. The empty fourth direction is the part a flat drawing
 * cannot show and the reason NH₃ accepts a proton.
 */
const ammonia: Molecule = {
  id: 'amoniac',
  name: 'Ammonia',
  nameVi: 'Ammonia',
  formula: 'NH₃',
  category: 'Hợp chất vô cơ',
  geometry: 'Chóp tam giác',
  bondAngle: '107.8°',
  formulaWeight: 17.03,
  // The pyramid solved from cos(107.8°) = 1.5·cos²β − 0.5 at r = 1.012 Å, so the
  // lone pair points along +z and the three hydrogens sit on the cone below.
  atoms: [
    { element: 'N', x: 0, y: 0, z: 0 },
    { element: 'H', x: 0.944, y: 0, z: -0.3646 },
    { element: 'H', x: -0.472, y: 0.8175, z: -0.3646 },
    { element: 'H', x: -0.472, y: -0.8175, z: -0.3646 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1 },
    { a: 0, b: 2, order: 1 },
    { a: 0, b: 3, order: 1 },
  ],
};

/**
 * Table salt is the entry that corrects a habit. "NaCl" is a ratio, not a
 * particle: there is no NaCl molecule to point at, only a lattice in which every
 * Na⁺ is surrounded by six Cl⁻ and every Cl⁻ by six Na⁺. Rotating the block
 * makes the six-fold coordination and the 90° contacts visible, and it explains
 * the cubic crystals in a salt shaker.
 */
const sodiumChloride: Molecule = {
  id: 'muoi-an',
  name: 'Sodium chloride',
  nameVi: 'Muối ăn',
  formula: 'NaCl',
  category: 'Tinh thể ion',
  geometry: 'Lập phương tâm mặt',
  bondAngle: '90°',
  formulaWeight: 58.44,
  isLattice: true,
  ...buildRockSalt(5.64, 1),
};

const caffeineParts = buildCaffeine();

const caffeine: Molecule = {
  id: 'caffeine',
  name: 'Caffeine',
  nameVi: 'Caffeine',
  formula: 'C₈H₁₀N₄O₂',
  category: 'Hợp chất hữu cơ',
  geometry: 'Phẳng — hai vòng ngưng tụ',
  bondAngle: '120° trong vòng sáu · 108° trong vòng năm',
  formulaWeight: 194.19,
  atoms: caffeineParts.atoms,
  bonds: caffeineParts.bonds,
};

/**
 * Order matters: this is the order the seven appear in the Library rail, and it
 * runs from the molecule every student already has a picture of to the one that
 * shows what a real organic structure looks like.
 */
export const MOLECULES: Molecule[] = [
  water,
  carbonDioxide,
  dioxygen,
  methane,
  ammonia,
  sodiumChloride,
  caffeine,
];

/** Falls back to water, so a bad `params.molecule` shows a molecule, not a hole. */
export function getMolecule(id: string | undefined): Molecule {
  return MOLECULES.find((molecule) => molecule.id === id) ?? water;
}

/** Distinct elements in the order they first appear, with how many there are. */
export function elementTally(molecule: Molecule): { symbol: string; count: number }[] {
  const tally: { symbol: string; count: number }[] = [];
  for (const atom of molecule.atoms) {
    const found = tally.find((entry) => entry.symbol === atom.element);
    if (found) found.count += 1;
    else tally.push({ symbol: atom.element, count: 1 });
  }
  return tally;
}
