'use client';

import { useState } from 'react';
import type { CatalogLocation } from '@nagi/database';
import { CatalogPicker } from '@/features/catalog/picker';
import { findEntryLocations } from './actions';

export type EntryLocationSelection = {
  country?: CatalogLocation;
  city?: CatalogLocation;
  neighborhood?: CatalogLocation;
};

export function EntryLocationFields({
  initial,
  filter = false,
}: {
  initial: EntryLocationSelection;
  filter?: boolean;
}) {
  const [country, setCountry] = useState(initial.country);
  const [city, setCity] = useState(initial.city);
  const [neighborhood, setNeighborhood] = useState(initial.neighborhood);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <CatalogPicker
        name={filter ? 'pays' : 'country_id'}
        label="Pays"
        value={country}
        selectedName={(item) => item.name}
        search={(query) => findEntryLocations('countries', query)}
        onSelect={(item) => {
          setCountry(item);
          setCity(undefined);
          setNeighborhood(undefined);
        }}
      />
      <CatalogPicker
        key={country?.id ?? 'no-country'}
        name={filter ? 'ville' : 'city_id'}
        label="Ville"
        value={city}
        selectedName={(item) => item.name}
        disabled={!country}
        search={(query) => findEntryLocations('cities', query, country?.id)}
        onSelect={(item) => {
          setCity(item);
          setNeighborhood(undefined);
        }}
      />
      {city?.has_neighborhoods ? (
        <CatalogPicker
          key={city.id}
          name={filter ? 'quartier' : 'neighborhood_id'}
          label={filter ? 'Quartier' : 'Quartier *'}
          value={neighborhood}
          selectedName={(item) => item.name}
          search={(query) => findEntryLocations('neighborhoods', query, city.id)}
          onSelect={setNeighborhood}
        />
      ) : (
        <input type="hidden" name={filter ? 'quartier' : 'neighborhood_id'} value="" />
      )}
    </div>
  );
}
