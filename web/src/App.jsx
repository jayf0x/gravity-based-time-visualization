import Title from './components/Title.jsx';
import Hud from './widgets/Hud.jsx';
import TimeScrubber from './widgets/TimeScrubber.jsx';
import WorldCanvas from './world/WorldCanvas.jsx';

export default function App() {
  return (
    <>
      <Title />
      <Hud />
      <TimeScrubber />
      <WorldCanvas />
    </>
  );
}
