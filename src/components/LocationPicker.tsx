import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { AU_BOUNDS, REGION_PRESETS } from '../../shared/regions';

export interface PickedLocation {
  lat: number;
  lon: number;
  label: string;
  presetId?: string;
}

interface Props {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
}

const inAustralia = (lat: number, lon: number) =>
  lat >= AU_BOUNDS.latMin && lat <= AU_BOUNDS.latMax && lon >= AU_BOUNDS.lonMin && lon <= AU_BOUNDS.lonMax;

export function LocationPicker({ value, onChange }: Props) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const manualValid = lat !== '' && lon !== '' && inAustralia(Number(lat), Number(lon));

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser can’t share location. Pick a district or enter coordinates.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (!inAustralia(latitude, longitude)) {
          setGeoError('Your location is outside Australia. Pick a district instead.');
          return;
        }
        onChange({ lat: latitude, lon: longitude, label: 'Your block' });
      },
      () => {
        setLocating(false);
        setGeoError('Location access was blocked. Pick a district or enter coordinates.');
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Orchard district" className="flex flex-wrap gap-2">
        {REGION_PRESETS.map((r) => {
          const selected = value?.presetId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ lat: r.lat, lon: r.lon, label: `${r.name}, ${r.district}`, presetId: r.id })}
              className={`rounded-full border px-4 py-2 text-left transition-colors ${
                selected ? 'border-leaf bg-leaf text-white' : 'border-line bg-card hover:border-leaf'
              }`}
            >
              <span className="font-bold">{r.name}</span>
              <span className={`ml-1.5 text-sm ${selected ? 'text-white/80' : 'text-muted'}`}>{r.district}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2 font-bold hover:border-leaf disabled:opacity-60"
        >
          <LocateFixed size={18} aria-hidden /> {locating ? 'Finding you…' : 'Use my location'}
        </button>
        {value && !value.presetId && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <MapPin size={16} aria-hidden /> {value.label} ({value.lat.toFixed(2)}, {value.lon.toFixed(2)})
          </span>
        )}
      </div>
      {geoError && <p role="alert" className="text-sm text-ember">{geoError}</p>}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-bark">Enter coordinates instead</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Latitude</span>
            <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-36.38"
              className="w-32 rounded-md border border-line bg-card px-3 py-2 tabular" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Longitude</span>
            <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="145.40"
              className="w-32 rounded-md border border-line bg-card px-3 py-2 tabular" />
          </label>
          <button type="button" disabled={!manualValid}
            onClick={() => onChange({ lat: Number(lat), lon: Number(lon), label: 'Your block' })}
            className="rounded-md bg-bark px-4 py-2 font-bold text-white disabled:opacity-40">
            Use these coordinates
          </button>
        </div>
        {lat !== '' && lon !== '' && !manualValid && (
          <p className="mt-2 text-ember">Coordinates need to be inside Australia (latitude is negative).</p>
        )}
      </details>
    </div>
  );
}
