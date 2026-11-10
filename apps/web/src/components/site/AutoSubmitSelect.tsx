'use client';

/** Select que envía el formulario al cambiar (sin JS, se usa el botón Buscar). */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  label,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-13 w-full appearance-none bg-white px-4 pr-10 text-[15px] font-medium ring-1 ring-linea outline-none focus:ring-2 focus:ring-gondola sm:w-56"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-gris" fill="currentColor">
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    </label>
  );
}
