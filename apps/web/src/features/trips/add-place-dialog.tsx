'use client';
import Link from 'next/link';
import { BookOpen, Plus } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@nagi/ui';
export function AddPlaceDialog({ guildId }: { guildId: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Plus className="size-4" />
          Ajouter un lieu
        </Button>
      </DialogTrigger>
      <DialogContent>
        <BookOpen className="mb-5 size-7 text-primary-ink" />
        <DialogTitle className="text-xl font-extrabold">
          Bientôt, vos idées prendront place.
        </DialogTitle>
        <DialogDescription className="mb-6 mt-4 text-sm leading-7 text-muted-foreground">
          La sélection de lieux depuis le catalogue Nagi arrive dans une prochaine étape. Vous
          pourrez composer votre itinéraire à partir des fiches existantes et les partager avec
          votre serveur.
        </DialogDescription>
        <Button asChild>
          <Link href={`/app/${guildId}/discover`}>Explorer le catalogue</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
