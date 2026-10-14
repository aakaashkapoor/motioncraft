// Writes assets/fonts/Geist-Bold.typeface.json, the three.js typeface used for
// 3D text, from assets/fonts/Geist-Bold.ttf. Rerun after changing the
// font, the character set or the converter.
//   npx tsx scripts/build-typeface.ts

import { writeFileSync } from "node:fs";
import { buildGeistBoldTypeface, GEIST_BOLD_TYPEFACE } from "../src/typeface/geistBold";

const json = buildGeistBoldTypeface();
writeFileSync(GEIST_BOLD_TYPEFACE, json);
console.log(`wrote ${GEIST_BOLD_TYPEFACE} (${(json.length / 1024).toFixed(1)} KB)`);
