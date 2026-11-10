'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginSchema } from '@rincon/shared';
import { api, ApiError } from '@/lib/client';
import { Button, Field, Input } from '@/components/admin/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await api('/auth/login', { method: 'POST', json: parsed.data });
      const next = params.get('next');
      router.replace(next && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin');
    } catch (err) {
      setFormError((err as ApiError).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 space-y-4">
      {formError && (
        <p role="alert" className="rounded-md bg-[#fbe4e2] px-3 py-2.5 text-[14px] text-[#7d1d17]">
          {formError}
        </p>
      )}
      <Field label="Email" error={errors.email}>
        {(id, d) => (
          <Input id={id} aria-describedby={d} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} />
        )}
      </Field>
      <Field label="Contraseña" error={errors.password}>
        {(id, d) => (
          <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} />
        )}
      </Field>
      <Button type="submit" variant="primary" loading={loading} className="w-full">
        Ingresar
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gondola p-12 text-etiqueta lg:flex">
        <Link href="/" className="text-[22px] font-extrabold w-cond">El Rincón del Busca</Link>
        <div>
          <p className="max-w-md text-[56px] leading-[0.9] font-black w-cond">El mostrador de atrás.</p>
          <p className="mt-4 max-w-sm text-etiqueta/70">Productos, stock, precios y proveedores del local. Lo que se edita acá se publica en la web.</p>
        </div>
        <div className="h-3 bg-kraft" />
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-[28px] font-bold tracking-tight w-semi">Ingresar al panel</h1>
          <p className="mt-1 text-[14px] text-gris">Sólo para el personal del local.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
          <Link href="/" className="mt-8 inline-block text-[13px] text-gris hover:text-tinta">
            Volver a la web
          </Link>
        </div>
      </div>
    </main>
  );
}
