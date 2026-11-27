'use client';
import { useId, useRef, useState, useTransition } from 'react';
import { FileJson, LoaderCircle, Upload } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from '@nagi/ui';
import {
  countryImportExample,
  countryImportMaxBytes,
  parseCountryImport,
  type ImportedCountry,
} from '@nagi/shared';
import { importCountries, type CountryImportState } from './import-actions';

export function CountryImportButton() {
  const id = useId(),
    generation = useRef(0);
  const [open, setOpen] = useState(false),
    [file, setFile] = useState<File>(),
    [countries, setCountries] = useState<ImportedCountry[]>([]),
    [state, setState] = useState<CountryImportState>({}),
    [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();
  const completed = state.created !== undefined;
  function close(next: boolean) {
    if (pending) return;
    generation.current++;
    setOpen(next);
    setFile(undefined);
    setCountries([]);
    setState({});
    setReading(false);
  }
  async function chooseFile(next: File | undefined) {
    const version = ++generation.current;
    setFile(next);
    setCountries([]);
    setState({});
    setReading(false);
    if (!next) return;
    if (next.size > countryImportMaxBytes) {
      setState({ error: 'Le fichier ne doit pas dépasser 1 Mo.' });
      return;
    }
    setReading(true);
    try {
      const result = parseCountryImport(await next.text());
      if (generation.current !== version) return;
      if (result.ok) setCountries(result.countries);
      else setState({ error: result.error, issues: result.issues });
    } catch {
      if (generation.current === version)
        setState({ error: 'Ce fichier ne peut pas être lu. Sélectionnez un autre fichier.' });
    } finally {
      if (generation.current === version) setReading(false);
    }
  }
  function submit() {
    if (!file || !countries.length || pending || completed) return;
    const form = new FormData();
    form.set('file', file);
    startTransition(async () => {
      setState({});
      try {
        setState(await importCountries(form));
      } catch {
        setState({
          error:
            'L’import n’a pas pu être confirmé. Réessayez ; les pays déjà présents seront ignorés.',
        });
      }
    });
  }
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => close(true)}>
        <Upload className="size-4" /> Importer un JSON
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          closeDisabled={pending}
          className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-5 overflow-y-auto p-5 sm:p-7"
        >
          <div className="pr-6">
            <DialogTitle className="text-lg font-semibold">Importer des pays</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
              Les pays sont créés en brouillon. L’adresse est générée depuis le nom ; la description
              et l’image sont facultatives.
            </DialogDescription>
          </div>
          <details className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer font-medium">Format du fichier JSON</summary>
            <p className="mt-3 leading-5 text-muted-foreground">
              Un pays seul ou une liste de pays, jusqu’à 500 pays et 1 Mo. L’ordre est un entier
              positif ou nul ; le code ISO contient deux lettres.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 leading-5">
              {countryImportExample}
            </pre>
            <a
              className="mt-3 inline-flex text-primary-ink underline underline-offset-4"
              download="pays-modele.json"
              href={`data:application/json;charset=utf-8,${encodeURIComponent(countryImportExample)}`}
            >
              Télécharger le modèle
            </a>
          </details>
          {!completed && (
            <div>
              <Label htmlFor={id}>Fichier JSON</Label>
              <Input
                id={id}
                type="file"
                accept=".json,application/json"
                disabled={pending}
                className="h-auto min-h-11 cursor-pointer py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-ink"
                onChange={(e) => {
                  void chooseFile(e.target.files?.[0]);
                }}
              />
            </div>
          )}
          {reading && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Lecture du fichier…
            </p>
          )}
          {!completed && countries.length > 0 && (
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FileJson className="size-4 text-primary-ink" />
                {countries.length} pays dans le fichier
              </p>
              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ordre</th>
                      <th className="px-3 py-2 font-medium">Pays / adresse</th>
                      <th className="px-3 py-2 font-medium">ISO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {countries.map((country) => (
                      <tr key={country.iso_code}>
                        <td className="px-3 py-3 tabular-nums">{country.sort_order}</td>
                        <td className="max-w-48 px-3 py-3">
                          <span className="block break-words font-semibold">{country.name}</span>
                          <span className="mt-1 block break-all text-muted-foreground">
                            {country.slug}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium">{country.iso_code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Les codes ISO déjà présents seront ignorés. Aucun pays existant ne sera modifié.
              </p>
            </div>
          )}
          {state.error && (
            <Alert className="text-destructive">
              <p>{state.error}</p>
              {!!state.issues?.length && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                  {state.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          {completed && (
            <Alert>
              <p className="font-semibold">
                {state.created}{' '}
                {state.created === 1 ? 'pays importé en brouillon' : 'pays importés en brouillon'}.
              </p>
              {!!state.skipped && (
                <p className="mt-2">
                  {state.skipped}{' '}
                  {state.skipped === 1
                    ? 'pays déjà présent, ignoré'
                    : 'pays déjà présents, ignorés'}
                  .
                </p>
              )}
            </Alert>
          )}
          <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => close(false)}
            >
              {completed ? 'Fermer' : 'Annuler'}
            </Button>
            {!completed && (
              <Button
                type="button"
                disabled={!countries.length || reading || pending}
                onClick={submit}
              >
                {pending && <LoaderCircle className="size-4 animate-spin" />}
                {pending ? 'Importation…' : 'Importer en brouillon'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
