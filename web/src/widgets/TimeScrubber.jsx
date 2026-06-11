import { useAtomValue, useSetAtom } from 'jotai';
import { displayTimeAtom, scrubOffsetMsAtom } from '../store/atoms';

export default function TimeScrubber() {
  const displayTime = useAtomValue(displayTimeAtom);
  const setScrubOffset = useSetAtom(scrubOffsetMsAtom);

  const handleTimelineChange = (e) => {
    const val = parseFloat(e.target.value);
    setScrubOffset(val * 0.5 * 365.25 * 86400000);
  };

  return (
    <>
      <div id="clock">{displayTime.toUTCString().replace('GMT', 'UTC')}</div>
      <input
        id="timeline"
        type="range"
        min="-1"
        max="1"
        step="0.0001"
        defaultValue="0"
        title="scrub ±6 months"
        onChange={handleTimelineChange}
      />
    </>
  );
}
