import type { Photograph } from "./content";

interface Place {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly introduction: string;
  readonly mood: string;
  readonly photograph: Photograph;
}

export interface Country extends Place {
  readonly region: string;
  readonly presentation: readonly { label: string; value: string }[];
}

export interface City extends Place {
  readonly countryId: Country["id"];
  readonly region: string;
  readonly caption: string;
  readonly discoveryPhotograph?: Photograph;
  readonly featurePhotograph?: Photograph;
}

export interface District extends Place {
  readonly cityId: City["id"];
}

// Les collections associées sont dérivées des identifiants parents : une seule
// source de vérité, sans tableaux d'identifiants à synchroniser des deux côtés.
export interface CountryWithCities extends Country {
  readonly cities: readonly City[];
}

export interface CityWithDistricts extends City {
  readonly districts: readonly District[];
}
