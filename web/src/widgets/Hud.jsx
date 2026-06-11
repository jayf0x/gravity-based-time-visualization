import { useAtomValue } from 'jotai';
import { hudDataAtom } from '../store/atoms';

export default function Hud() {
  const hudData = useAtomValue(hudDataAtom);

  if (!hudData) return <div id="hud">hover the globe…</div>;
  if (hudData.text) return <div id="hud">{hudData.text}</div>;

  const { lat, lon, elev, nsDay, cls, sign, grav, rot, tidal } = hudData;
  return (
    <div id="hud">
      lat {lat}°  lon {lon}°  elev {elev} m
      <br />
      <span className={`big ${cls}`}>
        {sign}
        {nsDay} ns/day
      </span>
      {' vs sea-level geoid'}
      <br />
      gravity   {grav} ns/day
      <br />
      rotation  {rot} ns/day
      <br />
      tides     {tidal} ns/day (real)
    </div>
  );
}
