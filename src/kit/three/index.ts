// 3D on the scene clock: the stage that draws a three.js scene each frame, the
// hook that loads its assets behind the readiness gate, theme-aware materials
// and studio lights, and Geist Bold for 3D text.

export { ThreeStage, type ThreeBuilt, type ThreeContext, type ThreeKey, type ThreeStageProps, type ThreeStageSize } from "./ThreeStage";
export { disposeScene } from "./disposeScene";
export { useThreeAsset } from "./useThreeAsset";
export { DEFAULT_MATERIAL_ROLE, material, MATERIAL_PRESETS, type MaterialPreset } from "./materials";
export { studioLights, type StudioLights } from "./lights";
export { geistBold, textGeometry, type TextGeometryOptions } from "./fonts3d";
export { studioEnvironment, type StudioEnvironment } from "./environment";
export { projectBox } from "./project";
