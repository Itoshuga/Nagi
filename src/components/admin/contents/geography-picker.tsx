"use client";
import { useState } from "react";
import type { GeographicReference } from "@/types/discoveries";

export interface GeographyOptions {
  countries: { id: string; name: string; status: string }[];
  cities: { id: string; name: string; status: string; countryId: string }[];
  districts: { id: string; name: string; status: string; cityId: string }[];
}
export function GeographyPicker({ data, value, multiple, onChange, error }: { data: GeographyOptions; value: GeographicReference[]; multiple: boolean; onChange: (value: GeographicReference[]) => void; error?: string }) {
  const first = multiple ? undefined : value[0];
  const initialDistrict = data.districts.find((item) => first?.kind === "district" && item.id === first.id);
  const initialCity = data.cities.find((item) => item.id === (first?.kind === "city" ? first.id : initialDistrict?.cityId));
  const [country, setCountry] = useState(first?.kind === "country" ? first.id : initialCity?.countryId ?? "");
  const [city, setCity] = useState(initialCity?.id ?? "");
  const [district, setDistrict] = useState(initialDistrict?.id ?? "");
  const selection = (countryId: string, cityId: string, districtId: string): GeographicReference[] => districtId ? [{ kind: "district", id: districtId }] : cityId ? [{ kind: "city", id: cityId }] : countryId && multiple ? [{ kind: "country", id: countryId }] : [];
  const label = (reference: GeographicReference) => (reference.kind === "country" ? data.countries : reference.kind === "city" ? data.cities : data.districts).find((item) => item.id === reference.id)?.name ?? "Destination indisponible";
  return <div id="destinations" tabIndex={-1} aria-describedby={error ? "destinations-error" : undefined}>
    <div className="content-location-fields"><div className="admin-field"><label htmlFor="content-country">Pays</label><select id="content-country" value={country} onChange={(event) => { setCountry(event.target.value); setCity(""); setDistrict(""); if (!multiple) onChange([]); }}><option value="">Choisir un pays</option>{data.countries.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === "draft" ? " · brouillon" : ""}</option>)}</select></div>
    <div className="admin-field"><label htmlFor="content-city">Ville {multiple && <span>Facultatif</span>}</label><select id="content-city" disabled={!country} value={city} onChange={(event) => { setCity(event.target.value); setDistrict(""); if (!multiple) onChange(selection(country, event.target.value, "")); }}><option value="">{multiple ? "Tout le pays" : "Choisir une ville"}</option>{data.cities.filter((item) => item.countryId === country).map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === "draft" ? " · brouillon" : ""}</option>)}</select></div>
    <div className="admin-field"><label htmlFor="content-district">Quartier <span>Facultatif</span></label><select id="content-district" disabled={!city} value={district} onChange={(event) => { setDistrict(event.target.value); if (!multiple) onChange(selection(country, city, event.target.value)); }}><option value="">Directement dans la ville</option>{data.districts.filter((item) => item.cityId === city).map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === "draft" ? " · brouillon" : ""}</option>)}</select></div></div>
    {multiple && <><button className="admin-button admin-button-quiet" type="button" disabled={!country || value.length >= 30} onClick={() => { const next = selection(country, city, district)[0]; if (next && !value.some((item) => item.id === next.id && item.kind === next.kind)) onChange([...value, next]); }}>Ajouter cette destination</button><ul className="content-chips">{value.map((item) => <li key={`${item.kind}:${item.id}`}><span>{label(item)} · {item.kind === "country" ? "Pays" : item.kind === "city" ? "Ville" : "Quartier"}</span><button type="button" aria-label={`Retirer ${label(item)}`} onClick={() => onChange(value.filter((ref) => ref.id !== item.id || ref.kind !== item.kind))}>×</button></li>)}</ul><p className="geo-field-hint">Ces associations sont explicites. Un restaurant qui propose cette spécialité ne lui ajoute pas de destination.</p></>}
    {!multiple && <p className="geo-field-hint">Un quartier est facultatif. La fiche remontera aussi dans sa ville.</p>}
    {error && <p id="destinations-error" className="geo-field-error">{error}</p>}
  </div>;
}
