/**
 * The Explore panel track.
 *
 * Shared by the story (which turns scroll position into a place on this list)
 * and the canvas (which samples camera, lights, backdrop and creature weights
 * from that place). It lives in its own module rather than being exported from
 * `ExploreCanvas` so that file stays a component-only module and keeps Fast
 * Refresh — a mixed component/constant export forces a full reload on every
 * edit to the scene, which is the file that gets edited most.
 *
 * Order matters and changed in this release: the bee is the hero. It has the
 * most compact silhouette of the three, which leaves the left half of the hero
 * free for the proposition, and it is the only creature with a full skeleton and
 * three authored clips — so it can actually fly *into* the composition instead
 * of being there when the page loads.
 */
export type ExploreScene = 'bee-hero' | 'bee-study' | 'fish' | 'jelly';

/** `progress` is a position along this list, not an index into it. */
export const EXPLORE_SCENES: ExploreScene[] = ['bee-hero', 'bee-study', 'fish', 'jelly'];
