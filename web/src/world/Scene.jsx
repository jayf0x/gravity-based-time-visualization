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
} from '../store/atoms';
import { sunDirection, moonDirection } from '../ephemeris';
import Earth from './Earth';
import Starfield from './Starfield';
import Controls from './Controls';
import Fog from './Fog';
import SunMarker from './SunMarker';
import MoonMarker from './MoonMarker';
import HudUpdater from './HudUpdater';

export default function Scene() {
  const { camera } = useThree();
  const setSimTime = useSetAtom(simTimeAtom);
  const setDisplayTime = useSetAtom(displayTimeAtom);
  const setSunDir = useSetAtom(sunDirectionAtom);
  const setMoonDir = useSetAtom(moonDirectionAtom);
  const simTime = useAtomValue(simTimeAtom);
  const scrubOffsetMs = useAtomValue(scrubOffsetMsAtom);
  const timeSpeed = useAtomValue(timeSpeedAtom);

  // Initialize camera
  useEffect(() => {
    camera.position.set(0, 1.1, 3.2);
    camera.lookAt(0, 0, 0);
  }, [camera]);

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
    </>
  );
}
