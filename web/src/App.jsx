import { useAtomValue } from 'jotai';
import { flyModeAtom } from './store/atoms';
import Title from './components/Title.jsx';
import Hud from './widgets/Hud.jsx';
import TimeScrubber from './widgets/TimeScrubber.jsx';
import WorldCanvas from './world/WorldCanvas.jsx';
import ModeSelect from './screens/ModeSelect.jsx';

// Read initial state from sessionStorage
const initialMode = sessionStorage.getItem('modeSelected') === 'true';

export default function App() {
  const flyMode = useAtomValue(flyModeAtom);
  const modeSelected = initialMode || (typeof flyMode === 'boolean');

  // Persist selection to sessionStorage when mode is selected
  if (modeSelected && sessionStorage.getItem('modeSelected') !== 'true') {
    sessionStorage.setItem('modeSelected', 'true');
  }

  return (
    <>
      {!modeSelected && <ModeSelect />}
      <Title />
      <Hud />
      <TimeScrubber />
      <WorldCanvas />
    </>
  );
}
