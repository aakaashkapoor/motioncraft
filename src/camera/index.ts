// The camera rig (design v3, life #1 and #12): breathing, shots onto
// elements, and parallax layers. `./measure` is browser only.

export { CAMERA_DEPTHS, OVERSCAN, cameraAtDepth, cameraTransform, layerPoint, layerTransform, lerpCamera, overscanRect, projectRect, wideCamera, type Camera, type CameraDepth } from "./rig";
export { breathing, cameraAt, shotFraming, type CameraInput, type CameraMode, type CameraTargets, type CameraView, type SceneTargets, type ShotTargetBox } from "./shots";
export { CAMERA_ATTRIBUTE, DEPTH_ATTRIBUTE, SHOT_ATTRIBUTE } from "./attributes";
export { CameraFree, CameraLayer, CameraWorld, formatShot, useLayerPoint } from "./Camera";
