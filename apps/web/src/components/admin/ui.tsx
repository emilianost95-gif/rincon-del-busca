'use client';

/**
 * Kit de interfaz del panel. Misma familia tipográfica y paleta que la
 * landing, pero en clave de productividad: densidad, contraste y calma.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X, XCircle } from 'lucide-react';

/* ----------------------------------------------------------- Botones */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const btn: Record<BtnVariant, string> = {
  primary: 'bg-gondola text-white hover:bg-gondola-soft disabled:bg-gondola/50',
  secondary: 'bg-white text-tinta ring-1 ring-linea hover:ring-gondola/40 hover:bg-[#f6f7f2]',
  ghost: 'text-tinta hover:bg-black/5',
  danger: 'bg-plumon text-white hover:bg-[#b4271f]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-3.5 text-[14px]'} ${btn[variant]} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ Campos */

const inputCls =
  'h-10 w-full rounded-md bg-white px-3 text-[14px] ring-1 ring-linea outline-none transition-shadow placeholder:text-gris/70 focus:ring-2 focus:ring-gondola aria-[invalid=true]:ring-plumon disabled:bg-[#f3f3ef]';

export function Field({
  label,
  error,
  hint,
  children,
  className = '',
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-tinta/80">
        {label}
      </label>
      {children(id, descId)}
      {(error || hint) && (
        <p id={descId} className={`mt-1.5 text-[12.5px] ${error ? 'text-plumon' : 'text-gris'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Input({ invalid, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} className={`${inputCls} ${className}`} />;
}

export function Select({ invalid, className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select {...props} aria-invalid={invalid || undefined} className={`${inputCls} pr-8 ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({ invalid, className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...props} aria-invalid={invalid || undefined} className={`${inputCls} h-auto min-h-20 py-2 ${className}`} />;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-gondola' : 'bg-[#cfd1c8]'}`}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[14px] font-medium">{label}</span>
        {description && <span className="block text-[12.5px] text-gris">{description}</span>}
      </label>
    </div>
  );
}

/* ---------------------------------------------------------- Estructura */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[26px] leading-tight font-bold tracking-tight w-semi">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-[14px] text-gris">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className = '', padded = true }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-lg bg-white ring-1 ring-linea ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-linea px-4 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'; children: React.ReactNode }) {
  const tones = {
    neutral: 'bg-[#eeefe9] text-tinta/75',
    green: 'bg-[#e3efe6] text-[#1e6a3f]',
    amber: 'bg-[#fbefd2] text-[#8a5a00]',
    red: 'bg-[#fbe4e2] text-[#a3241d]',
    blue: 'bg-[#e3ecf4] text-[#2d5878]',
  };
  return <span className={`inline-flex h-5.5 items-center rounded px-1.5 text-[12px] font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, description, action, icon: Icon = Inbox }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <Icon className="size-8 text-gris/60" />
      <p className="mt-3 text-[15px] font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13.5px] text-gris">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#ecede7] ${className}`} aria-hidden />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8" />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-[#fbe4e2] p-4 text-[14px] text-[#7d1d17]" role="alert">
      <XCircle className="size-5 shrink-0" />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/** Tabla con encabezado fijo y scroll horizontal en móvil. */
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">{children}</table>
    </div>
  );
}
export const Th = ({ children, className = '', ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th {...p} className={`border-b border-linea bg-[#fafaf7] px-4 py-2.5 text-left text-[12.5px] font-medium text-gris ${className}`}>
    {children}
  </th>
);
export const Td = ({ children, className = '', ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...p} className={`border-b border-linea/70 px-4 py-3 align-middle ${className}`}>
    {children}
  </td>
);

/* ------------------------------------------------------- Modal / Drawer */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = false,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const els = ref.current.querySelectorAll<HTMLElement>('a,button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="admin fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-tinta/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-full flex-col bg-white shadow-2xl ${
          side
            ? `ml-auto h-full w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} animate-[slideIn_.18s_ease-out]`
            : `m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-lg`
        }`}
      >
        <header className="flex items-start gap-3 border-b border-linea px-5 py-4">
          <div className="flex-1">
            <h2 id={titleId} className="text-[17px] font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-gris">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-md hover:bg-black/5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-linea bg-[#fafaf7] px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------------------- Notificaciones y confirmación */

type Toast = { id: number; tone: 'success' | 'error'; message: string };
type ConfirmOpts = { title: string; message: string; confirmLabel: string; danger?: boolean };

const FeedbackCtx = createContext<{
  toast: (message: string, tone?: Toast['tone']) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
} | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })), []);
  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100%-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-lg bg-tinta px-4 py-3 text-[14px] text-white shadow-xl">
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#7fd49e]" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-[#ff8a80]" />}
            <p className="flex-1">{t.message}</p>
          </div>
        ))}
      </div>
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title ?? ''}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancelar</Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {pending?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          {pending?.danger && <AlertTriangle className="size-5 shrink-0 text-plumon" />}
          <p className="text-[14px] text-tinta/85">{pending?.message}</p>
        </div>
      </Modal>
    </FeedbackCtx.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}

/** Paginación simple. */
export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-linea px-4 py-3 text-[13px] text-gris">
      <span className="tnum">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
