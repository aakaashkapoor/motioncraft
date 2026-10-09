// The markers the camera leaves in the page, for the in-page measurements
// (shot targets, the layer-1 checks).

/** Marks a scene's camera world. */
export const CAMERA_ATTRIBUTE = "data-camera";
/** On a camera world while it is on a shot: the target's box on screen, "x y width height" in frame px. */
export const SHOT_ATTRIBUTE = "data-camera-shot";
/** On a parallax layer: the share of the camera's motion it follows. */
export const DEPTH_ATTRIBUTE = "data-camera-depth";
