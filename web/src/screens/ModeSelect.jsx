import { useSetAtom } from 'jotai';
import { flyModeAtom, cityAtom, CITIES } from '../store/atoms';
import '../styles/ModeSelect.css';

export default function ModeSelect() {
  const setFlyMode = useSetAtom(flyModeAtom);
  const setCity = useSetAtom(cityAtom);

  const LOCATIONS = [
    { name: 'Tokyo', key: 'Tokyo' },
    { name: 'New York', key: 'New York' },
    { name: 'La Paz', key: 'La Paz (3,640 m)' },
    { name: 'Reykjavík', key: 'Reykjavík (ridge)' },
  ];

  const handleMode = (isFlightMode) => {
    setFlyMode(isFlightMode);
    setCity(LOCATIONS[0].key);
  };

  return (
    <div className="mode-select">
      <div className="panel">
        <h1>TOPOLOGY WORLD</h1>
        <p className="subtitle">Real Earth topology · Relativistic time lens</p>

        <div className="locations">
          <p className="label">Select starting location:</p>
          <div className="location-grid">
            {LOCATIONS.map((loc) => (
              <button
                key={loc.key}
                className="location-btn"
                onClick={() => setCity(loc.key)}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mode-buttons">
          <button className="btn btn-flight" onClick={() => handleMode(true)}>
            ⬆ FLIGHT
          </button>
          <button className="btn btn-orbit" onClick={() => handleMode(false)}>
            🔵 ORBIT
          </button>
        </div>

        <p className="hint">
          Hover over the globe to see relativistic time dilation. Drag to rotate (orbit) or fly with WASD.
        </p>
      </div>
    </div>
  );
}
