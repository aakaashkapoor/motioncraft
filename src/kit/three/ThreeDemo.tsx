// An internal demo of the 3D stage (registered in `internalKit`, not the
// public kit): a glossy accent rounded box turning slowly above a 3D text
// label, lit by the studio rig with the studio environment. Both are
// `ThreeKey`s ("box" and "label"), so the layer-1 checks see them. The camera
// frames the box and the label from the stage's shape, so they fill about
// FILL of it in 9:16, 16:9 and 4:5 alike. `shift` moves the subject by a
// fraction of the stage, for tests that need 3D outside the safe area.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { contentArea } from "../../layout/caption";
import { blockCenterY } from "../../layout/block";
import type { Rect } from "../../layout/frame";
import type { KitProps } from "../types";
import { textGeometry } from "./fonts3d";
import { studioLights } from "./lights";
import { material } from "./materials";
import { ThreeStage, type ThreeBuilt, type ThreeContext, type ThreeStageSize } from "./ThreeStage";

export interface ThreeDemoProps extends KitProps {
  /** The 3D text under the box. Default "motioncraft". */
  label?: string;
  /** Moves the subject by these fractions of the stage's width and height (y down). Default none. */
  shift?: { x: number; y: number };
}

/** Vertical field of view, degrees. */
const FOV = 30;
/** The share of the stage's width and height the subject may take, at most. */
const FILL = 0.75;
const BOX_SIZE = 1;
const BOX_RADIUS = 0.12;
const TEXT_SIZE = 0.24;
const GAP = 0.3;
/** Turn rate about the vertical axis, radians per second of scene time. */
const TURN_PER_SECOND = 0.35;
const TURN_AT_ZERO = 0.6;
const TILT = 0.35;
/**
 * Room the turning, tilted box takes across, up and toward the camera: its
 * face diagonal. Turned 45 degrees it is that wide; tilted by TILT it stands
 * cos(TILT) + sin(TILT) * diagonal, about 1.42, tall.
 */
const BOX_REACH = BOX_SIZE * Math.SQRT2;

interface DemoState {
  subject: THREE.Group;
  box: THREE.Mesh;
  /** The subject's width and height, in scene units. */
  extent: { width: number; height: number };
}

/** The stage: the area's full width, centred vertically on the block centre, as tall as fits the area. */
function stageBox(area: Rect, centerY: number): Rect {
  const half = Math.max(1, Math.min(centerY - area.y, area.y + area.height - centerY));
  return { x: area.x, y: centerY - half, width: area.width, height: 2 * half };
}

/** Puts the camera where the subject fills FILL of the stage, and moves the subject by `shift`. */
function frame(ctx: ThreeContext<DemoState>, shift: { x: number; y: number }): void {
  const { extent, subject } = ctx.state!;
  const camera = ctx.camera as THREE.PerspectiveCamera;
  const aspect = ctx.size.width / ctx.size.height;
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  // The view height the subject needs at its plane, then the distance that gives it.
  const viewHeight = Math.max(extent.height / FILL, extent.width / (FILL * aspect));
  const distance = viewHeight / (2 * tan) + BOX_REACH / 2;
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  const planeHeight = 2 * distance * tan;
  subject.position.set(shift.x * planeHeight * aspect, -shift.y * planeHeight, 0);
}

export function ThreeDemo({ progress, theme, aspect, area, label = "motioncraft", shift = { x: 0, y: 0 } }: ThreeDemoProps) {
  const stage = stageBox(area ?? contentArea(theme, aspect), blockCenterY(theme, aspect, area));

  const build = (size: ThreeStageSize): ThreeBuilt<DemoState> => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, size.width / size.height, 0.1, 100);
    studioLights(scene, theme);

    const text = new THREE.Mesh(textGeometry(label, { size: TEXT_SIZE }), material(theme, "matte", "text"));
    text.name = "label";
    const bounds = text.geometry.boundingBox!;
    const textWidth = bounds.max.x - bounds.min.x;
    const textHeight = bounds.max.y - bounds.min.y;
    const extent = { width: Math.max(BOX_REACH, textWidth), height: BOX_REACH + GAP + textHeight };

    const box = new THREE.Mesh(new RoundedBoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE, 4, BOX_RADIUS), material(theme, "glossy"));
    box.name = "box";
    // The subject's centre at its origin: the box at the top, the label at the bottom.
    box.position.y = extent.height / 2 - BOX_REACH / 2;
    text.position.y = -extent.height / 2 + textHeight / 2;

    const subject = new THREE.Group();
    subject.add(box, text);
    scene.add(subject);
    return {
      scene,
      camera,
      keys: [
        { label: "box", object: box },
        { label: "label", object: text, text: label, color: theme.colors.text },
      ],
      state: { subject, box, extent },
    };
  };

  const update = (ctx: ThreeContext<DemoState>, ms: number) => {
    frame(ctx, shift);
    ctx.state!.box.rotation.set(TILT, TURN_AT_ZERO + (TURN_PER_SECOND * ms) / 1000, 0);
  };

  return <ThreeStage area={stage} aspect={aspect} progress={progress} build={build} update={update} environment="studio" label="ThreeDemo" />;
}
