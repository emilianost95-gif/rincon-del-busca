import {
  Apple,
  Baby,
  Bath,
  CookingPot,
  Hammer,
  Lamp,
  Package,
  PawPrint,
  PencilRuler,
  ShoppingBasket,
  Sparkles,
  SprayCan,
  Wheat,
  Wine,
  type LucideIcon,
} from 'lucide-react';

/** Íconos disponibles para categorías (se eligen desde el panel). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  wheat: Wheat,
  'spray-can': SprayCan,
  'cooking-pot': CookingPot,
  lamp: Lamp,
  sparkles: Sparkles,
  package: Package,
  apple: Apple,
  bath: Bath,
  hammer: Hammer,
  'paw-print': PawPrint,
  baby: Baby,
  'pencil-ruler': PencilRuler,
  wine: Wine,
  'shopping-basket': ShoppingBasket,
};

export function CategoryIcon({ name, ...props }: { name: string } & React.ComponentProps<LucideIcon>) {
  const Icon = CATEGORY_ICONS[name] ?? Package;
  return <Icon aria-hidden {...props} />;
}

/** Logo de WhatsApp (lucide no lo incluye por ser marca). */
export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm0 18.1c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3a8.2 8.2 0 1 1 7 3.8Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 1.8.8 2.5.8 3.4.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
