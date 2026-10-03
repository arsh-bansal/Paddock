import { useEffect, useId, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { AU_BOUNDS, REGION_PRESETS } from '../../shared/regions';
import { searchPlaces, type PlaceSuggestion } from '../lib/api';

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

const AU_STATES = [
  'Victoria',
  'New South Wales',
  'Queensland',
  'South Australia',
  'Western Australia',
  'Tasmania',
  'Australian Capital Territory',
  'Northern Territory',
] as const;

const DEBOUNCE_MS = 280;

export function LocationPicker({ value, onChange }: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.label ?? '');
  const [state, setState] = useState<(typeof AU_STATES)[number] | ''>('Victoria');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const skipSearchRef = useRef(false);

  // Keep the search box in sync when a district button (or saved report) sets the value.
  useEffect(() => {
    if (!value) return;
    skipSearchRef.current = true;
    setQuery(value.label);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }, [value?.lat, value?.lon, value?.label, value?.presetId]);

  // Debounced address search (Open-Meteo via /api/geocode).
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    // Don't re-search once the grower has already picked this exact label.
    if (value && q === value.label) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const t = window.setTimeout(() => {
      void searchPlaces(q, state || undefined)
        .then((res) => {
          if (cancelled) return;
          setSuggestions(res.results);
          setOpen(true);
          setActive(res.results.length > 0 ? 0 : -1);
        })
        .catch((e) => {
          if (cancelled) return;
          setSuggestions([]);
          setSearchError((e as Error).message);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, state, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pickPlace = (place: PlaceSuggestion) => {
    skipSearchRef.current = true;
    setQuery(place.label);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    setGeoError(null);
    if (place.admin1 && (AU_STATES as readonly string[]).includes(place.admin1)) {
      setState(place.admin1 as (typeof AU_STATES)[number]);
    }
    onChange({ lat: place.lat, lon: place.lon, label: place.label });
  };

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser can’t share location. Search for a town or pick a district.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (!inAustralia(latitude, longitude)) {
          setGeoError('Your location is outside Australia. Search for a town or pick a district.');
          return;
        }
        skipSearchRef.current = true;
        setQuery('Your block');
        setSuggestions([]);
        setOpen(false);
        onChange({ lat: latitude, lon: longitude, label: 'Your block' });
      },
      () => {
        setLocating(false);
        setGeoError('Location access was blocked. Search for a town or pick a district.');
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pickPlace(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

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

      <div ref={wrapRef} className="relative max-w-2xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <label className="sr-only" htmlFor={`${listId}-state`}>
            State or territory
          </label>
          <select
            id={`${listId}-state`}
            value={state}
            onChange={(e) => {
              setState(e.target.value as (typeof AU_STATES)[number] | '');
              setOpen(true);
              setGeoError(null);
            }}
            className="rounded-xl border border-line bg-card px-3 py-3 shadow-sm sm:w-44 sm:shrink-0"
          >
            <option value="">All Australia</option>
            {AU_STATES.map((s) => (
              <option key={s} value={s}>
                {s === 'Australian Capital Territory' ? 'ACT' : s === 'Northern Territory' ? 'NT' : s === 'New South Wales' ? 'NSW' : s === 'Western Australia' ? 'WA' : s === 'South Australia' ? 'SA' : s}
              </option>
            ))}
          </select>

          <label htmlFor={`${listId}-input`} className="sr-only">
            Search for a town or suburb
          </label>
          <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border border-line bg-card shadow-sm focus-within:border-frost focus-within:ring-2 focus-within:ring-frost/30">
            <span className="flex items-center pl-3 text-muted" aria-hidden>
              <Search size={18} />
            </span>
            <input
              id={`${listId}-input`}
              type="search"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
              autoComplete="off"
              placeholder="Search town, suburb or postcode"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setGeoError(null);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setOpen(true);
              }}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 outline-none placeholder:text-muted/70"
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              title={locating ? 'Finding you…' : 'Use my location'}
              aria-label={locating ? 'Finding you…' : 'Use my location'}
              className="flex items-center justify-center border-l border-line px-3.5 text-bark transition-colors hover:bg-leaf-soft hover:text-leaf disabled:opacity-60"
            >
              <LocateFixed size={20} aria-hidden className={locating ? 'animate-pulse' : undefined} />
            </button>
          </div>
        </div>

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching places"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-card py-1 shadow-lg"
          >
            {suggestions.map((s, i) => {
              const isActive = i === active;
              return (
                <li key={s.id} role="option" aria-selected={isActive} id={`${listId}-opt-${i}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pickPlace(s)}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left ${
                      isActive ? 'bg-leaf-soft text-bark' : 'hover:bg-paper'
                    }`}
                  >
                    <MapPin size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                    <span>
                      <span className="font-bold">{s.name}</span>
                      {s.label !== s.name && (
                        <span className="mt-0.5 block text-sm text-muted">{s.label.replace(`${s.name}, `, '')}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {searching && (
          <p className="mt-2 text-sm text-muted" aria-live="polite">
            Searching…
          </p>
        )}
        {!searching && open && query.trim().length >= 2 && suggestions.length === 0 && !searchError && value?.label !== query.trim() && (
          <p className="mt-2 text-sm text-muted">No places matched. Try another spelling, or pick a district above.</p>
        )}
        {searchError && (
          <p role="alert" className="mt-2 text-sm text-ember">
            {searchError}
          </p>
        )}
      </div>

      {value && !value.presetId && (
        <p className="inline-flex items-center gap-1.5 text-sm text-muted">
          <MapPin size={16} aria-hidden /> {value.label} ({value.lat.toFixed(2)}, {value.lon.toFixed(2)})
        </p>
      )}
      {geoError && (
        <p role="alert" className="text-sm text-ember">
          {geoError}
        </p>
      )}
    </div>
  );
}
