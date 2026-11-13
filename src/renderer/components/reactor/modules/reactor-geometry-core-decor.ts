import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import { buildCentralChamber } from "./reactor-central-chamber";

export function buildCoreDecorations(
  coreGroup: THREE.Group,
  materials: ReactorMaterials,
  graphicsQuality: string
): void {
  coreGroup.name = "arc-central-core";

  // ==========================================
  // CENTRAL CHAMBER (A.R.C. Core Precision Architecture)
  // ==========================================
  const centralChamberRig = buildCentralChamber(materials, graphicsQuality);
  coreGroup.add(centralChamberRig.group);
}
