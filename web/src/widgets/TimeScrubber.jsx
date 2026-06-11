// ±6-month scrub slider + UTC clock. Uncontrolled: main.js attaches the
// input listener and writes the clock text (legacy bridge until R3F port).
export default function TimeScrubber() {
  return (
    <>
      <div id="clock" />
      <input
        id="timeline"
        type="range"
        min="-1"
        max="1"
        step="0.0001"
        defaultValue="0"
        title="scrub ±6 months"
      />
    </>
  );
}
