import * as THREE from "three";

export interface ReactorLighting {
  ambientLight: THREE.AmbientLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  topSpot: THREE.DirectionalLight;
  rimLight: THREE.PointLight;
  coreLight: THREE.PointLight;
  innerChamberLight: THREE.PointLight;
  trenchLights: THREE.PointLight[];
}

export function createReactorLighting(
  scene: THREE.Scene,
  initialColorHex: number,
): ReactorLighting {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
  keyLight.position.set(-15, 20, 20);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x505060, 0.7);
  fillLight.position.set(15, -15, 15);
  scene.add(fillLight);

  const topSpot = new THREE.DirectionalLight(0xffffff, 0.55);
  topSpot.position.set(0, 25, 10);
  scene.add(topSpot);

  const rimLight = new THREE.PointLight(initialColorHex, 0.0, 20.0, 2.0);
  rimLight.position.set(0, 0, -4.5);
  scene.add(rimLight);

  const coreLight = new THREE.PointLight(initialColorHex, 0.0, 8.0, 2.2);
  coreLight.position.z = 0.35;

  const innerChamberLight = new THREE.PointLight(initialColorHex, 0.0, 6.0, 2.0);
  innerChamberLight.position.z = -0.15;

  const trenchLights: THREE.PointLight[] = [];

  return {
    ambientLight,
    keyLight,
    fillLight,
    topSpot,
    rimLight,
    coreLight,
    innerChamberLight,
    trenchLights,
  };
}
