import { whatsappLink } from '@rincon/shared';
import { WhatsAppGlyph } from './icons';

type Variant = 'cartel' | 'outline-light' | 'solid-dark' | 'quiet';

const styles: Record<Variant, string> = {
  cartel: 'bg-cartel text-tinta hover:bg-[#f7e968]',
  'outline-light': 'border-2 border-etiqueta/70 text-etiqueta hover:bg-etiqueta hover:text-gondola',
  'solid-dark': 'bg-gondola text-etiqueta hover:bg-gondola-soft',
  quiet: 'text-gondola underline underline-offset-4 decoration-2 hover:decoration-cartel',
};

/**
 * Botón de WhatsApp. Si el número todavía no está cargado en el panel,
 * se muestra deshabilitado y lo dice: nunca un botón que no hace nada.
 */
export function WhatsAppButton({
  number,
  message,
  label = 'Escribir por WhatsApp',
  variant = 'cartel',
  className = '',
}: {
  number: string | null;
  message?: string;
  label?: string;
  variant?: Variant;
  className?: string;
}) {
  const href = whatsappLink(number, message);
  const base = `inline-flex min-h-12 items-center justify-center gap-2.5 px-5 text-[15px] font-semibold w-semi transition-colors ${variant === 'quiet' ? 'min-h-0 px-0' : ''}`;

  if (!href) {
    return (
      <span
        aria-disabled="true"
        title="El número de WhatsApp todavía no fue cargado desde el panel"
        className={`${base} cursor-not-allowed whitespace-nowrap ${label.length < 12 ? '!px-2 !text-[13px]' : ''} opacity-60 ${variant === 'quiet' ? 'text-gris' : 'border-2 border-dashed border-current'} ${className}`}
      >
        <WhatsAppGlyph className="size-5" />
        {label.length < 12 ? 'WhatsApp pendiente' : 'WhatsApp pendiente de configurar'}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} ${styles[variant]} ${className}`}>
      <WhatsAppGlyph className="size-5" />
      {label}
    </a>
  );
}
