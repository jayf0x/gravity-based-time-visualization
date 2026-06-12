import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  simTimeAtom,
  scrubOffsetMsAtom,
  displayTimeAtom,
  sunDirectionAtom,
  moonDirectionAtom,
  timeSpeedAtom,
  cityAtom,
  CITIES,
} from '../store/atoms';
import { sunDirection, moonDirection } from '../ephemeris';
import { latLonToVec } from '../timeField';
import '../world/qaBridge'; // Initialize QA hooks
import Earth from './Earth';
import Starfield from './Starfield';
import Controls from './Controls';
import Fog from './Fog';
import SunMarker from './SunMarker';
import MoonMarker from './MoonMarker';
import HudUpdater from './HudUpdater';
import Minimap from './Minimap';

export default function Scene() {
  const { camera } = useThree();
  const setSimTime = useSetAtom(simTimeAtom);
  const setDisplayTime = useSetAtom(displayTimeAtom);
  const setSunDir = useSetAtom(sunDirectionAtom);
  const setMoonDir = useSetAtom(moonDirectionAtom);
  const simTime = useAtomValue(simTimeAtom);
  const scrubOffsetMs = useAtomValue(scrubOffsetMsAtom);
  const timeSpeed = useAtomValue(timeSpeedAtom);
  const city = useAtomValue(cityAtom);

  // Initialize camera based on selected city
  useEffect(() => {
    const latLon = CITIES[city];
    if (!latLon) {
      // Global view
      camera.position.set(0, 1.1, 3.2);
    } else {
      // Zoom to city: position camera at 2.5x distance from location
      const pos = latLonToVec(latLon[0], latLon[1]);
      const dist = 2.5;
      camera.position.set(pos[0] * dist, pos[1] * dist, pos[2] * dist);
    }
    camera.lookAt(0, 0, 0);
  }, [camera, city]);

  // Update time and ephemeris each frame
  useFrame((state, dt) => {
    const newSimTime = new Date(simTime.getTime() + dt * timeSpeed * 1000);
    setSimTime(newSimTime);

    const displayTime = new Date(newSimTime.getTime() + scrubOffsetMs);
    setDisplayTime(displayTime);

    const sun = sunDirection(displayTime);
    const moon = moonDirection(displayTime);

    setSunDir(sun);
    setMoonDir(moon);
  });

  return (
    <>
      <color attach="background" args={[0x000000]} />
      <Earth />
      <Starfield />
      <Fog />
      <Controls />
      <SunMarker />
      <MoonMarker />
      <HudUpdater />
      <Minimap />
    </>
  );
}
