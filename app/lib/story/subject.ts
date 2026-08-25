/**
 * Where the hero creature is on screen, right now.
 *
 * The flower field is a Canvas2D layer composited ABOVE the WebGL frame, so
 * every plant it draws is in front of the bee no matter what depth it claims to
 * be at. The layering the brief asks for — valley behind, bee, then only a small
 * foreground pass — cannot come from stacking order here; it has to come from
 * the field knowing where the creature is and refusing to paint over it.
 *
 * The previous version approximated that with a hand-authored ellipse at a fixed
 * frame position. That was already only roughly right, and it stopped being
 * right at all once the bee was re-scaled and turned: the creature moves with
 * its hover bob, its entry arc, the pointer parallax and the chapter hand-over,
 * and a static ellipse tracks none of it.
 *
 * So `ExploreCanvas` projects the creature's actual bounding box every frame and
 * writes it here, and the flower renderer reads it. One mutable object, one
 * writer, one reader, no allocation per frame — deliberately not a React value,
 * because this changes 60 times a second and nothing in the DOM needs to
 * re-render when it does.
 *
 * Coordinates are CSS pixels in the stage's own frame, which is what the flower
 * renderer's projection already produces.
 */
export type SubjectRect = {
  /** Frame-space bounds in CSS px. Meaningless while `presence` is 0. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** 0 when the creature is absent; the field ignores the rect below ~0.01. */
  presence: number;
};

export const subjectRect: SubjectRect = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  presence: 0,
};

export function clearSubjectRect() {
  subjectRect.presence = 0;
}
