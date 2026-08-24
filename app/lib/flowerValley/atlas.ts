/**
 * The flower atlas, sliced once.
 *
 * `pool_summer.png` is a 1500x1312 sheet of 8x7 photographic cut-outs: four rows
 * of blooms, two of grasses and foliage, one of dried leaves. The reference
 * implementation's single largest performance decision was to stop sampling that
 * sheet per flower and instead cut it into 56 standalone bitmaps at load, so the
 * hot loop is `drawImage(tile, x, y, w, h)` against a small power-of-two-ish
 * surface with no source rectangle arithmetic and no atlas cache thrash. That is
 * kept here verbatim, including the `createImageBitmap` upgrade — an
 * `ImageBitmap` is a GPU-resident, already-decoded surface, and the difference
 * against a `<canvas>` source shows up as soon as a thousand of them are drawn
 * in one frame.
 *
 * ---- the one thing that is not verbatim ----
 *
 * The sheet was authored for the reference's near-black valley, where saturated
 * photographic flowers are the only light in the frame. YooLab's hero is warm
 * ivory, and dropped straight onto it the same sprites read as stickers: the
 * greens go to near-black against a #fbf8f4 ground, and the reds compete with the
 * ruby bee, which has to stay the highest-contrast object on the page.
 *
 * So the tint is baked into the 56 tiles at slice time rather than applied per
 * flower. `ctx.filter` is the thing the reference removed from its draw loop and
 * it is the right tool *here*, where it runs 56 times in total and then never
 * again — a per-frame filter costs a full-canvas readback per flower, a bake-time
 * one costs nothing measurable. Two passes:
 *
 *   1. `saturate/brightness/contrast` — takes a little of the postcard out of the
 *      photography without touching hue, so coral, blush, lavender and cream keep
 *      their relationships to each other.
 *   2. an ivory wash through `source-atop` — lifts the darkest pixels toward the
 *      page's own background *inside the sprite's alpha only*, which is what stops
 *      the foliage rows reading as holes punched in the hero. This is aerial
 *      perspective applied to the material rather than to the frame.
 *
 * `filter` is a no-op on a context that does not implement it, which is the
 * correct degradation: slightly hotter flowers, never a missing field.
 */

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 7;

/** A sliced sprite. Both branches are valid `drawImage` sources. */
export type FlowerTile = ImageBitmap | HTMLCanvasElement;

export type FlowerAtlas = {
  tiles: FlowerTile[];
  dispose(): void;
};

/**
 * Row index of a tile, which is the only structural fact the field needs: rows
 * 0-3 are blooms, 4-5 are grasses and foliage, 6 is dried leaves.
 */
export const tileRow = (tile: number) => Math.floor(tile / ATLAS_COLS);

/*
 * Both numbers came down after the first 1920 capture.
 *
 * 0.88/1.05/0.93 with a 0.17 wash, plus the renderer's own aerial haze on top,
 * bleached the sheet: the blooms read as pressed and faded rather than soft, and
 * the two foliage rows disappeared entirely — which cost the field the green
 * structure that makes a meadow a meadow rather than a scatter of petals. The
 * grade is now barely a grade, and the wash does the one job it is actually
 * needed for.
 */
const GRADE = 'saturate(0.95) contrast(0.97)';
/** The page's own hero ivory, at the strength that lifts the dark foliage
 *  without frosting the blooms. */
const WASH = 'rgba(252, 247, 240, 0.09)';

function sliceTile(source: ImageBitmap, col: number, row: number, size: number): HTMLCanvasElement {
  const cell = document.createElement('canvas');
  cell.width = size;
  cell.height = size;
  const ctx = cell.getContext('2d', { alpha: true });
  if (!ctx) return cell;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const sw = source.width / ATLAS_COLS;
  const sh = source.height / ATLAS_ROWS;

  /*
   * A one-pixel inset on the source rectangle.
   *
   * 1500x1312 over 8x7 is 187.5 by 187.43 — neither cell edge lands on a pixel
   * boundary, so a bilinear read at the seam pulls in whatever is in the next
   * cell. On the reference's black ground that is invisible; on ivory it shows up
   * at 3x magnification as faint rectangular ghosts beside the sprites. A pixel
   * off a 187-pixel cell costs nothing that is ever drawn.
   */
  ctx.filter = GRADE;
  ctx.drawImage(source, col * sw + 1, row * sh + 1, sw - 2, sh - 2, 0, 0, size, size);
  ctx.filter = 'none';

  /* Only where the sprite already is. `source-atop` keeps the destination's
     alpha, so the cut-out silhouette is untouched and only its colour moves. */
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = WASH;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  return cell;
}

/**
 * Loads and slices the atlas.
 *
 * `cell` is the size each sprite is rasterised at. It is a quality knob rather
 * than a fidelity one: a foreground flower can be 260 px tall, so 192 is
 * generous on a laptop and 128 is invisible on a phone where the largest flower
 * is under 140.
 */
export async function loadFlowerAtlas(url: string, cell: number): Promise<FlowerAtlas> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`flower atlas ${response.status}`);
  const sheet = await createImageBitmap(await response.blob());

  const canvases: HTMLCanvasElement[] = [];
  for (let row = 0; row < ATLAS_ROWS; row += 1) {
    for (let col = 0; col < ATLAS_COLS; col += 1) canvases.push(sliceTile(sheet, col, row, cell));
  }
  sheet.close();

  let tiles: FlowerTile[] = canvases;
  try {
    tiles = await Promise.all(canvases.map((canvas) => createImageBitmap(canvas)));
  } catch {
    /* Keep the canvases. Every browser this project targets has
       `createImageBitmap`, but a failure here is a performance regression, not a
       broken field, and it must not be fatal. */
  }

  return {
    tiles,
    dispose() {
      for (const tile of tiles) if ('close' in tile) tile.close();
    },
  };
}
