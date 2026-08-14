import Link from "next/link";
import type { ReactNode } from "react";

/*
  Komponen bersama untuk landing dan /app.

  Satu berkas supaya kedua halaman tidak bisa menyimpang: kalau tombol berubah
  di sini, berubah di dua-duanya.

  Setiap komponen punya varian `dark`. Bagian gelap dan terang bergantian
  sepanjang halaman, jadi tiap komponen harus bisa hidup di keduanya.
*/

type Tone = "light" | "dark";

const tokens = (tone: Tone) => ({
  fg: tone === "dark" ? "var(--on-dark)" : "var(--on-light)",
  soft: tone === "dark" ? "var(--on-dark-soft)" : "var(--on-light-soft)",
  faint: tone === "dark" ? "var(--on-dark-faint)" : "var(--on-light-faint)",
  line: tone === "dark" ? "var(--line-dark)" : "var(--line-light)",
});

/** Penanda bagian. Kecil, tenang, selalu di atas judul. */
export function Pill({ children, tone = "light" }: { children: ReactNode; tone?: Tone }) {
  const t = tokens(tone);
  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-[0.75rem] font-medium"
      style={{
        background: tone === "dark" ? "var(--ink-soft)" : "var(--paper-soft)",
        color: t.soft,
      }}
    >
      {children}
    </span>
  );
}

/** Menyorot satu frasa di dalam kalimat, tanpa memutus alirannya. */
export function Mark({
  children,
  color = "var(--grow)",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="rounded-lg px-2 py-0.5 whitespace-nowrap"
      style={{ background: "var(--ink)", color }}
    >
      {children}
    </span>
  );
}

export function Button({
  href, children, tone = "light", variant = "solid", external,
}: {
  href: string; children: ReactNode; tone?: Tone;
  variant?: "solid" | "ghost"; external?: boolean;
}) {
  const solid = variant === "solid";
  const style = solid
    ? { background: tone === "dark" ? "var(--paper)" : "var(--ink)",
        color: tone === "dark" ? "var(--ink)" : "var(--on-dark)" }
    : { background: "transparent", color: tokens(tone).fg,
        border: `1px solid ${tokens(tone).line}` };

  const cls =
    "inline-flex items-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-semibold transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2";

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  );
}

/** Eyebrow di atas judul bagian. */
export function Eyebrow({
  children, color = "var(--grow)",
}: { children: ReactNode; color?: string }) {
  return (
    <p
      className="text-[0.75rem] font-semibold tracking-[0.18em] uppercase"
      style={{ color }}
    >
      {children}
    </p>
  );
}

/** Penomoran langkah: 01 —— 03 */
export function StepIndex({
  step, total, tone = "light",
}: { step: number; total: number; tone?: Tone }) {
  const t = tokens(tone);
  return (
    <div className="flex items-center gap-3 text-[0.8125rem]" style={{ color: t.faint }}>
      <span className="tnum">{String(step).padStart(2, "0")}</span>
      <span className="h-px w-8" style={{ background: t.line }} />
      <span className="tnum">{String(total).padStart(2, "0")}</span>
    </div>
  );
}

/** Angka besar dengan satuan. Dipakai di hero dan di dashboard. */
export function Figure({
  value, unit, accent, label, note, tone = "light",
}: {
  value: string; unit: string; accent: string;
  label: string; note?: string; tone?: Tone;
}) {
  const t = tokens(tone);
  return (
    <div>
      <p className="text-[0.75rem] font-semibold tracking-[0.14em] uppercase" style={{ color: t.soft }}>
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span
          className="tnum text-[clamp(2rem,6vw,3.25rem)] leading-none font-semibold"
          style={{ color: accent }}
        >
          {value}
        </span>
        <span className="text-[0.9375rem] font-medium" style={{ color: t.soft }}>
          {unit}
        </span>
      </p>
      {note && (
        <p className="mt-2 text-[0.875rem] leading-relaxed" style={{ color: t.soft }}>
          {note}
        </p>
      )}
    </div>
  );
}

export function Card({
  children, tone = "light", className = "",
}: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div
      className={`rounded-3xl p-7 sm:p-9 ${className}`}
      style={{
        background: tone === "dark" ? "var(--ink-soft)" : "var(--paper-soft)",
        color: tokens(tone).fg,
      }}
    >
      {children}
    </div>
  );
}

export function Section({
  children, tone = "light", id, className = "",
}: { children: ReactNode; tone?: Tone; id?: string; className?: string }) {
  return (
    <section
      id={id}
      className={`px-5 py-20 sm:px-8 sm:py-28 ${className}`}
      style={{
        background: tone === "dark" ? "var(--ink)" : "var(--paper)",
        color: tokens(tone).fg,
      }}
    >
      <div className="mx-auto w-full max-w-[68rem]">{children}</div>
    </section>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Alamat atau hash yang tertaut ke explorer. Selalu dipendekkan. */
export function ExplorerLink({
  value, href, tone = "light", full,
}: { value: string; href: string; tone?: Tone; full?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="addr text-[0.875rem] underline decoration-1 underline-offset-4 transition-opacity hover:opacity-70"
      style={{ color: tokens(tone).soft }}
    >
      {full ? value : short(value)}
    </a>
  );
}

export function Nav({ tone = "light" }: { tone?: Tone }) {
  const t = tokens(tone);
  return (
    <header
      className="sticky top-0 z-50 px-5 py-4 backdrop-blur-md sm:px-8"
      style={{
        background: tone === "dark" ? "rgba(11,15,20,0.8)" : "rgba(255,255,255,0.8)",
        borderBottom: `1px solid ${t.line}`,
      }}
    >
      <div className="mx-auto flex w-full max-w-[68rem] items-center justify-between">
        <Link href="/" className="text-[1.0625rem] font-extrabold tracking-tight" style={{ color: t.fg }}>
          Duo
        </Link>
        <nav className="flex items-center gap-5 text-[0.875rem]">
          <span className="hidden sm:inline" style={{ color: t.faint }}>
            Flare Coston2
          </span>
          <Link
            href="/app"
            className="rounded-full px-4 py-2 font-semibold"
            style={{
              background: tone === "dark" ? "var(--paper)" : "var(--ink)",
              color: tone === "dark" ? "var(--ink)" : "var(--on-dark)",
            }}
          >
            Buka aplikasi
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer({ contracts }: { contracts: Record<string, string> }) {
  return (
    <footer className="px-5 py-16 sm:px-8" style={{ background: "var(--ink)", color: "var(--on-dark)" }}>
      <div className="mx-auto w-full max-w-[68rem]">
        <Eyebrow color="var(--on-dark-faint)">Kontrak di Coston2</Eyebrow>
        <dl className="mt-5 grid gap-2 text-[0.875rem]">
          {Object.entries(contracts).map(([name, addr]) => (
            <div key={name} className="flex flex-wrap items-baseline justify-between gap-2">
              <dt style={{ color: "var(--on-dark-soft)" }}>{name}</dt>
              <dd>
                <ExplorerLink
                  value={addr}
                  href={`https://coston2-explorer.flare.network/address/${addr}`}
                  tone="dark"
                  full
                />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 max-w-[52ch] text-[0.8125rem] leading-relaxed" style={{ color: "var(--on-dark-faint)" }}>
          Jaringan uji. Token tanpa nilai uang. Kontrak belum diaudit — jangan
          pernah menaruh dana sungguhan.
        </p>
        <p className="mt-12 text-[clamp(3rem,14vw,9rem)] leading-none font-extrabold tracking-tight" style={{ color: "var(--ink-soft)" }}>
          Duo
        </p>
      </div>
    </footer>
  );
}
