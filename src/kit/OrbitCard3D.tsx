// OrbitCard3D, ported from HyperFrames `orbit-card` (pinned 2905162): one
// feature card orbits a softly lit sphere of dots, the camera drifting with
// it, and lands in front, face-on, its round aperture framing the sphere.
//
// The card is a beveled plate (the theme's surface, lit by the studio rig)
// with its copy (icon badge, title, subtitle in the theme's card colours and
// fonts) painted onto a canvas texture once the fonts are loaded. The sphere
// is a Fibonacci point cloud in the muted text colour with an accent cap,
// tilted and turning slowly; each frame its dots are shaded by the key
// light's direction, so it reads as a lit ball rather than a flat disc.
//
// Timing (scene clock): the orbit sets off on the lead (150 ms), travels 220
// degrees from behind the sphere with an ease-out and lands at 1.8 s while the
// camera dollies in; the sphere keeps turning through the hold; the whole
// stage fades out fast onto the last frame. The DOM carries the orbit's
// progress (`data-orbit`), so markup-level timing checks see the entrance.
// The checks see the card and the sphere as `ThreeKey`s.

import * as THREE from "three";
import { ICON_NODES, type IconNode } from "../icons/nodes";
import { entering, useSceneTime } from "./frameContext";
import { exitOpacity } from "./motion";
import {
  CAP_Y,
  DOTS_DEFAULT,
  ORBIT_LAND_MS,
  ORBIT_START_MS,
  SHADOW_REACH,
  orbitCard3DErrors,
  orbitCardLayout,
  orbitPose,
  orbitRadius,
  paintCardFace,
  sphereGeometry,
  sphereRadius,
  type CardShape,
  type DrawIcon,
  type FaceLine,
  type OrbitCardLayout,
} from "./orbitCard3dPlan";
import { union } from "../checks/geometry";
import { studioLights } from "./three/lights";
import { projectBox } from "./three/project";
import { ThreeStage, type ThreeBuilt, type ThreeContext, type ThreeStageSize } from "./three/ThreeStage";
import { useThreeAsset } from "./three/useThreeAsset";
import type { KitProps } from "./types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";

export interface OrbitCard3DProps extends KitProps {
  /** The card's title, 1-32 characters. */
  title: string;
  /** A line under the title, up to 60 characters. */
  subtitle?: string;
  /** A bundled icon name (see `ICON_NAMES`), in a badge beside the title. */
  icon?: string;
  /** How many dots make the sphere, 400-4000. Default 1600. */
  dots?: number;
}

/** Vertical field of view, degrees. */
const FOV = 30;
/** The face texture's px per screen px. */
const TEXTURE_SCALE = 2;
/** The sphere's tilt toward the camera (radians) and turn rate (radians per second of scene time), from the source. */
const SPHERE_TILT = -0.32;
const SPIN_PER_SECOND = 0.35;
/** A dot's diameter in scene units at 1600 dots on a unit sphere; fewer dots are larger. */
const DOT_SIZE = 0.05;
/** How far the camera starts to the side and above its landed place, scene units. */
const DRIFT = { x: -1.1, y: 0.45 };
/** The theme's card shadow is set for flat cards on the page; a card floating in 3D takes a little more. */
const SHADOW_BOOST = 1.6;
/**
 * How much of the studio environment the plate takes, and how strongly it reflects it: the
 * diffuse light keeps a light theme's surface light, while a weak, soft reflection (no clear
 * coat) keeps a dark theme's surface dark under its light text.
 */
const PLATE_ENV = 0.45;
const PLATE_SPECULAR = 0.35;
/** Passes of the camera's pan toward the subject's centre; each takes most of what is left. */
const CENTRE_PASSES = 3;
/** The face's text shows to the checks while the face turns no more than this far from the camera (radians). */
const TEXT_FACING = Math.PI / 3;
/** Where light comes from: the studio key light (see `studioLights`). */
const LIGHT = new THREE.Vector3(3, 4, 5).normalize();

interface OrbitState {
  layout: OrbitCardLayout;
  card: THREE.Group;
  body: THREE.Group;
  text: TextProxy[];
  sphere: THREE.Group;
  points: THREE.Points;
  /** Each dot's lit and unlit colour (linear rgb), and the scratch for its shading. */
  lit: Float32Array;
  shade: Float32Array;
}

/** Draws a bundled 24-unit line icon with canvas paths. */
const drawIcon: DrawIcon = (ctx, name, x, y, size, color) => {
  const g = ctx as CanvasRenderingContext2D;
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [tag, attrs] of ICON_NODES[name as keyof typeof ICON_NODES] as IconNode) {
    const n = (key: string) => Number(attrs[key] ?? 0);
    if (tag === "path") g.stroke(new Path2D(String(attrs.d)));
    else if (tag === "circle") {
      g.beginPath();
      g.arc(n("cx"), n("cy"), n("r"), 0, Math.PI * 2);
      g.stroke();
    } else {
      g.beginPath();
      g.roundRect(n("x"), n("y"), n("width"), n("height"), n("rx"));
      g.stroke();
    }
  }
  g.restore();
};

/** The plate: a rounded rect with the aperture cut through, its aperture centre at the origin, its face at z = depth / 2 + bevel. */
function plateGeometry(shape: CardShape): THREE.ExtrudeGeometry {
  const { width: w, height: h, corner: r, hole } = shape;
  const x = -w / 2;
  const y = -h / 2 - hole.y;
  const outline = new THREE.Shape();
  outline.moveTo(x + r, y);
  outline.lineTo(x + w - r, y);
  outline.quadraticCurveTo(x + w, y, x + w, y + r);
  outline.lineTo(x + w, y + h - r);
  outline.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  outline.lineTo(x + r, y + h);
  outline.quadraticCurveTo(x, y + h, x, y + h - r);
  outline.lineTo(x, y + r);
  outline.quadraticCurveTo(x, y, x + r, y);
  const aperture = new THREE.Path();
  aperture.absarc(0, 0, hole.r, 0, Math.PI * 2, true);
  outline.holes.push(aperture);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: shape.depth,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 4,
    curveSegments: 64,
  });
  geometry.translate(0, 0, -shape.depth / 2);
  return geometry;
}

/** A round, soft-edged dot, so points draw as discs rather than squares. */
function dotSprite(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = Math.hypot(i + 0.5 - size / 2, j + 0.5 - size / 2) / (size / 2);
      const a = Math.min(1, Math.max(0, (1 - d) / 0.18));
      data.set([255, 255, 255, Math.round(255 * a)], 4 * (j * size + i));
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** A line of the face's text, for the checks: an undrawn box where the line is painted, and what it says in which colour. */
interface TextProxy {
  mesh: THREE.Mesh;
  line: FaceLine;
}

/**
 * The card's face: its copy painted onto a canvas texture, on a plane over
 * the plate's face, and an undrawn box over each painted line of text, which
 * the checks read as 3D text (see `ThreeKey`).
 */
function copyPlane(theme: Theme, layout: OrbitCardLayout, input: Pick<OrbitCard3DProps, "aspect" | "title" | "subtitle" | "icon">): { face: THREE.Mesh; text: TextProxy[] } {
  const { copyPx, shape } = layout;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(copyPx.width * TEXTURE_SCALE);
  canvas.height = Math.round(copyPx.height * TEXTURE_SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  const lines = paintCardFace(ctx, { theme, layout, drawIcon, ...input });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(shape.copy.width, shape.copy.height),
    // Unlit and not tone mapped: the copy shows the theme's exact colours.
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  face.name = "copy";
  face.position.set(0, shape.copy.y - shape.hole.y, shape.depth / 2 + 0.035);
  const unit = 1 / layout.pxPerUnit;
  const text = lines.map((line) => {
    // Measured (its geometry has a box), never drawn.
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(line.width * unit, line.height * unit), new THREE.MeshBasicMaterial({ visible: false }));
    mesh.name = "text";
    mesh.position.set((line.x + line.width / 2 - copyPx.width / 2) * unit, -(line.y + line.height / 2 - copyPx.height / 2) * unit, 0.001);
    face.add(mesh);
    return { mesh, line };
  });
  return { face, text };
}

/**
 * The card's soft shadow (the theme's card shadow, as on a flat card): a
 * blurred rounded rect with the aperture cleared, on a plane just behind the
 * plate. It faces forward only, so the card's back is never shaded by it.
 */
function shadowPlane(theme: Theme, layout: OrbitCardLayout): THREE.Mesh {
  const { shape, pxPerUnit } = layout;
  const { y, blur, opacity } = theme.cardShadow;
  // In card px, at half resolution: a shadow needs no detail.
  const k = 0.5;
  const margin = blur * SHADOW_REACH;
  const width = shape.width * pxPerUnit + 2 * margin;
  const height = shape.height * pxPerUnit + 2 * margin;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * k);
  canvas.height = Math.round(height * k);
  const g = canvas.getContext("2d")!;
  g.scale(k, k);
  // Only the shadow lands on the canvas: the rect itself is drawn off to the left.
  const away = width + 2 * margin;
  g.shadowColor = withAlpha(theme.colors.shadow, Math.min(1, opacity * SHADOW_BOOST));
  g.shadowBlur = blur * k;
  g.shadowOffsetX = away * k;
  g.shadowOffsetY = y * k;
  g.fillStyle = "#000";
  g.beginPath();
  g.roundRect(margin - away, margin, shape.width * pxPerUnit, shape.height * pxPerUnit, shape.corner * pxPerUnit);
  g.fill();
  g.globalCompositeOperation = "destination-out";
  g.shadowColor = "transparent";
  g.beginPath();
  g.arc(width / 2, margin + (shape.height / 2 - shape.hole.y) * pxPerUnit, (shape.hole.r + 0.05) * pxPerUnit, 0, Math.PI * 2);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width / pxPerUnit, height / pxPerUnit),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.FrontSide }),
  );
  plane.name = "shadow";
  plane.position.set(0, -shape.hole.y, -shape.depth / 2 - 0.08);
  return plane;
}

/** Places the camera for `ms`: landed, the card fills its box face-on; before that, farther off and to the side, looking at the same point. */
function poseCamera(ctx: ThreeContext<OrbitState>, ms: number): void {
  const { layout } = ctx.state!;
  const camera = ctx.camera as THREE.PerspectiveCamera;
  const { shape, pxPerUnit, box, stage } = layout;
  const pose = orbitPose(ms);
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  // The distance at which the stage's height shows `stage.height / pxPerUnit` units at the landed card's face.
  const distance = stage.height / pxPerUnit / (2 * tan);
  const face = orbitRadius(shape) + shape.depth / 2 + 0.03;
  // Aim so the landed card's centre lands on its box's centre.
  const dx = (box.x + box.width / 2 - (stage.x + stage.width / 2)) / pxPerUnit;
  const dy = (box.y + box.height / 2 - (stage.y + stage.height / 2)) / pxPerUnit;
  const aim = new THREE.Vector3(-dx, -shape.hole.y + dy, face);
  camera.position.set(aim.x + DRIFT.x * pose.drift, aim.y + DRIFT.y * pose.drift, face + distance * pose.dolly);
  camera.lookAt(aim);
  // The camera pans with the subject (card and sphere), keeping it on the box's centre line as the card swings round.
  const target = box.x + box.width / 2 - stage.x;
  const right = new THREE.Vector3();
  for (let pass = 0; pass < CENTRE_PASSES; pass++) {
    camera.updateMatrixWorld(true);
    const seen = union([projectBox(ctx.state!.body, camera, frameBox(ctx)), projectBox(ctx.state!.points, camera, frameBox(ctx))].filter((r) => r !== undefined));
    if (seen === undefined) return;
    const off = seen.x + seen.width / 2 - target;
    const perPx = (2 * camera.position.distanceTo(aim) * tan) / ctx.size.height;
    right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(off * perPx);
    camera.position.add(right);
    aim.add(right);
    camera.lookAt(aim);
  }
}

/** The stage's own box, px. */
const frameBox = (ctx: ThreeContext<OrbitState>) => ({ x: 0, y: 0, width: ctx.size.width, height: ctx.size.height });

/** Shades each dot by the key light: lit where its surface faces the light, dimmer toward the back. */
function shadeSphere(state: OrbitState): void {
  const { points, lit, shade, sphere } = state;
  sphere.updateMatrixWorld(true);
  const normal = new THREE.Vector3();
  const matrix = new THREE.Matrix3().setFromMatrix4(points.matrixWorld);
  const positions = points.geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = points.geometry.getAttribute("color") as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    normal.fromBufferAttribute(positions, i).applyMatrix3(matrix).normalize();
    const diffuse = Math.max(0, normal.dot(LIGHT));
    const facing = (normal.z + 1) / 2;
    const k = Math.min(1, 0.18 + 0.55 * diffuse + 0.35 * facing);
    for (let c = 0; c < 3; c++) shade[3 * i + c] = lit[6 * i + 3 + c]! + (lit[6 * i + c]! - lit[6 * i + 3 + c]!) * k;
  }
  colors.copyArray(shade);
  colors.needsUpdate = true;
}

/** The fonts the face is painted in, loaded before the stage mounts (the canvas would draw a fallback otherwise). */
function loadFonts(theme: Theme, aspect: OrbitCard3DProps["aspect"]): Promise<unknown> {
  const { type, fonts, weights } = theme;
  const fontSet = (globalThis as { document?: Document }).document?.fonts;
  if (fontSet === undefined) return Promise.resolve();
  return Promise.all([fontSet.load(`${type.title[aspect].weight} ${type.subtitle[aspect].size}px ${fonts.display}`), fontSet.load(`${weights.regular} ${type.body[aspect].size}px ${fonts.body}`)]);
}

export function OrbitCard3D(props: OrbitCard3DProps) {
  const errors = orbitCard3DErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`OrbitCard3D: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, title, subtitle, icon, dots = DOTS_DEFAULT } = props;
  const layout = orbitCardLayout(theme, aspect, slot);
  const { root, stage } = layout;
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const opacity = exitOpacity(theme, time, ORBIT_LAND_MS - ORBIT_START_MS);
  const fontsReady = useThreeAsset(`orbit-card fonts: ${theme.fonts.display} | ${theme.fonts.body}`, () => loadFonts(theme, aspect)) !== undefined;

  const build = (size: ThreeStageSize): ThreeBuilt<OrbitState> => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, size.width / size.height, 0.1, 200);
    studioLights(scene, theme);
    const { shape } = layout;

    // The card: plate and face in a group whose origin is the aperture's centre, on a pivot at the sphere's centre.
    const plate = new THREE.Mesh(
      plateGeometry(shape),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(theme.colors.surface), roughness: 0.55, metalness: 0, specularIntensity: PLATE_SPECULAR, envMapIntensity: PLATE_ENV }),
    );
    plate.name = "plate";
    const card = new THREE.Group();
    card.name = "card";
    // The body (plate and copy) is what the checks see; the shadow is not.
    const body = new THREE.Group();
    const copy = copyPlane(theme, layout, { aspect, title, subtitle, icon });
    body.add(plate, copy.face);
    card.add(shadowPlane(theme, layout), body);
    const pivot = new THREE.Group();
    pivot.add(card);

    // The sphere: tilted toward the camera, turning about its own axis.
    const radius = sphereRadius(shape);
    const geometry = sphereGeometry(dots);
    const positions = geometry.getAttribute("position");
    const lit = new Float32Array(dots * 6);
    const muted = new THREE.Color(theme.colors.textMuted);
    const accent = new THREE.Color(theme.colors.accent);
    const ground = new THREE.Color(theme.colors.ground);
    for (let i = 0; i < dots; i++) {
      const base = positions.getY(i) > CAP_Y ? accent : muted;
      // Unlit, a dot sinks most of the way into the ground.
      const dark = base.clone().lerp(ground, 0.7);
      lit.set([base.r, base.g, base.b, dark.r, dark.g, dark.b], 6 * i);
    }
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        // A point's px size is size * (half the view height / depth); a length's is length * (half the view height / (depth * tan(fov/2))).
        size: (DOT_SIZE * Math.sqrt(DOTS_DEFAULT / dots) * radius) / tan,
        sizeAttenuation: true,
        vertexColors: true,
        map: dotSprite(),
        transparent: true,
        alphaTest: 0.05,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    points.name = "sphere";
    points.scale.setScalar(radius);
    const sphere = new THREE.Group();
    sphere.add(points);
    const tilt = new THREE.Group();
    tilt.rotation.x = SPHERE_TILT;
    tilt.add(sphere);
    scene.add(tilt, pivot);

    return {
      scene,
      camera,
      keys: [
        { label: "card", object: body },
        { label: "sphere", object: points },
        ...copy.text.map(({ mesh, line }, i) => ({ label: `card text ${i + 1}`, object: mesh, text: line.text, color: theme.colors[line.color] })),
      ],
      state: { layout, card, body, text: copy.text, sphere, points, lit, shade: new Float32Array(dots * 3) },
    };
  };

  const update = (ctx: ThreeContext<OrbitState>, now: number) => {
    const state = ctx.state!;
    // `now` is the stage's own scene ms; the entrance runs on `entering` (a settled opening runs ahead).
    const pose = orbitPose(now + (ms - time.ms), orbitRadius(state.layout.shape));
    state.card.position.set(pose.card.x, 0, pose.card.z);
    state.card.rotation.set(pose.tilt, pose.angle, 0);
    for (const { mesh } of state.text) mesh.visible = Math.abs(pose.angle) <= TEXT_FACING;
    state.sphere.rotation.y = (SPIN_PER_SECOND * now) / 1000;
    shadeSphere(state);
    poseCamera(ctx, now + (ms - time.ms));
  };

  return (
    <div
      data-orbit-card=""
      data-orbit={orbitPose(ms).done.toFixed(4)}
      style={{ position: "absolute", left: root.x, top: root.y, width: root.width, height: root.height, opacity }}
    >
      {fontsReady && (
        <ThreeStage
          area={{ x: stage.x - root.x, y: stage.y - root.y, width: stage.width, height: stage.height }}
          aspect={aspect}
          progress={progress}
          build={build}
          update={update}
          environment="studio"
          label="OrbitCard3D"
        />
      )}
    </div>
  );
}
