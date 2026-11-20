'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { cn } from './utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={8}
        align="start"
        collisionPadding={12}
        className={cn(
          'z-[60] rounded-2xl border border-border bg-card shadow-lg outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
export function DialogContent({
  children,
  className,
  closeDisabled = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { closeDisabled?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-card p-7 shadow-xl',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Fermer"
          disabled={closeDisabled}
          className="absolute right-5 top-5 rounded-full p-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuLabel = DropdownPrimitive.Label;
export const DropdownMenuSeparator = DropdownPrimitive.Separator;
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup;
export const DropdownMenuRadioItem = DropdownPrimitive.RadioItem;
export const DropdownMenuSub = DropdownPrimitive.Sub;
export const DropdownMenuSubTrigger = DropdownPrimitive.SubTrigger;
export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.SubContent>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.SubContent
        sideOffset={6}
        collisionPadding={10}
        className={cn('z-[70] rounded-2xl border border-border bg-card p-1.5 shadow-lg', className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}
export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={8}
        align="end"
        className={cn(
          'z-50 min-w-52 rounded-2xl border border-border bg-card p-1.5 shadow-lg',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}
export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm outline-none focus:bg-muted data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
export function Toaster() {
  return <Sonner position="bottom-right" richColors closeButton />;
}
export { toast } from 'sonner';
