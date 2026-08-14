"use client";

import { useState } from "react";
import {
  loadSnapshot, looksLikeAddress, fmt6, fmtUsd,
  addresses, EXPLORER, type Snapshot,
} from "@/lib/duo";

// Akun yang sudah punya riwayat pembagian sungguhan di Coston2.
const DEMO_ADDRESS = "0x98a21cAbEcAc9Ec66Ba1121A75000E933Ead6bC3";

export default function Page() {
  const [input, setInput] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function look(address: string) {
    if (!looksLikeAddress(address)) {
      setError("Belum berbentuk alamat. Masukkan alamat XRPL (diawali r) atau alamat Flare (diawali 0x).");
      setSnap(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSnap(await loadSnapshot(address));
    } catch {
      setError("Gagal membaca dari Coston2. Coba lagi sebentar.");
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[46rem] px-5 pb-24 sm:px-8">
      <Header />

      <section className="pt-10 sm:pt-14">
        <h1 className="text-[1.375rem] leading-snug font-medium sm:text-[1.625rem]">
          Pembayaran XRP masuk.
          <br />
          Kebutuhanmu diamankan, sisanya menabung sendiri.
        </h1>
        <p
          className="mt-4 max-w-[38ch] text-[0.9375rem] leading-relaxed"
          style={{ fontFamily: "var(--font-sans)", color: "var(--ink-soft)" }}
        >
          Tanpa dompet baru, tanpa memasang apa pun. Masukkan alamat XRPL atau Flare
          untuk melihat isinya — halaman ini hanya membaca dari rantai.
        </p>

        <form
          className="mt-8 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            look(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="r… atau 0x…"
            spellCheck={false}
            autoCapitalize="none"
            aria-label="Alamat XRPL atau Flare"
            className="min-w-0 flex-1 border px-3 py-3 text-[0.9375rem] outline-none focus-visible:ring-2"
            style={{
              background: "var(--paper-edge)",
              borderColor: "var(--rule)",
              color: "var(--ink)",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            className="label cursor-pointer border px-5 py-3 disabled:opacity-50"
            style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
          >
            {loading ? "Membaca…" : "Lihat"}
          </button>
        </form>

        <button
          onClick={() => {
            setInput(DEMO_ADDRESS);
            look(DEMO_ADDRESS);
          }}
          className="mt-3 cursor-pointer text-[0.75rem] underline underline-offset-4"
          style={{ color: "var(--ink-faint)" }}
        >
          Pakai akun contoh yang sudah punya riwayat
        </button>

        {error && (
          <p className="mt-5 text-[0.8125rem]" style={{ color: "var(--stamp)" }}>
            {error}
          </p>
        )}
      </section>

      {snap && <Receipt snap={snap} />}

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="rule-single flex items-baseline justify-between border-t-0 pt-6">
      <span className="text-[0.9375rem] font-semibold tracking-[0.2em]">DUO</span>
      <span className="label">Flare Coston2</span>
    </header>
  );
}

function Receipt({ snap }: { snap: Snapshot }) {
  const hasActivity = snap.stable > BigInt(0) || snap.shares > BigInt(0) || snap.fxrpIdle > BigInt(0);

  return (
    <section className="mt-14">
      <div className="torn" aria-hidden />
      <div
        className="px-5 py-8 sm:px-8"
        style={{ background: "var(--paper-edge)" }}
      >
        {snap.xrplAddress && (
          <Row label="Alamat XRPL">
            <span className="text-[0.8125rem] break-all">{snap.xrplAddress}</span>
          </Row>
        )}

        <Row label="Akun di Flare">
          <a
            href={`${EXPLORER}/address/${snap.personalAccount}`}
            target="_blank"
            rel="noreferrer"
            className="text-[0.8125rem] break-all underline underline-offset-4"
          >
            {snap.personalAccount}
          </a>
        </Row>

        <Row label="Aturan">
          {snap.targetUsd > BigInt(0) ? (
            <span className="text-[0.9375rem]">
              Amankan {fmtUsd(snap.targetUsd)} dulu. Sisanya tabung.
            </span>
          ) : (
            <span className="text-[0.9375rem]" style={{ color: "var(--ink-soft)" }}>
              Belum diatur — semua yang masuk akan ditabung.
            </span>
          )}
        </Row>

        {!hasActivity ? (
          <p
            className="rule-double mt-6 pt-6 text-[0.9375rem]"
            style={{ color: "var(--ink-soft)", fontFamily: "var(--font-sans)" }}
          >
            Belum ada pembayaran masuk ke akun ini. Begitu ada XRP yang tiba,
            angkanya muncul di sini.
          </p>
        ) : (
          <>
            <Envelope
              label="Aman — siap dicairkan"
              amount={fmt6(snap.stable)}
              unit="USDT0"
              accent="var(--secured)"
              note="Nilainya terkunci di dolar. Tidak ikut naik-turun harga XRP."
              top
            />
            <Envelope
              label="Menabung"
              amount={fmt6(snap.shares)}
              unit="stXRP"
              accent="var(--saving)"
              note={`Setara ${fmt6(snap.sharesAsFxrp)} FXRP pada kurs ${snap.coston2Rate.toFixed(6)}.`}
            />

            {snap.fxrpIdle > BigInt(0) && (
              <div className="rule-single mt-6 flex items-baseline justify-between pt-4">
                <span className="label">Belum dibelah</span>
                <span className="text-[0.9375rem]">{fmt6(snap.fxrpIdle)} FXRP</span>
              </div>
            )}
          </>
        )}

        <div className="rule-double mt-8 pt-5">
          <p
            className="text-[0.8125rem] leading-relaxed"
            style={{ color: "var(--ink-soft)", fontFamily: "var(--font-sans)" }}
          >
            Menarik tabungan butuh waktu <strong>sampai 2 periode</strong>. Firelight
            memproses penarikan per periode, dan permintaan bisa masuk ke periode
            berikutnya. Bukan penarikan instan.
          </p>
          {snap.mainnetRate > 0 && (
            <p
              className="mt-3 text-[0.75rem] leading-relaxed"
              style={{ color: "var(--ink-faint)", fontFamily: "var(--font-sans)" }}
            >
              Di Coston2 imbal hasil belum berjalan, jadi kursnya masih{" "}
              {snap.coston2Rate.toFixed(6)}. Sebagai pembanding, vault Firelight di
              mainnet saat ini {snap.mainnetRate.toFixed(6)} FXRP per stXRP — itu
              angka mainnet, bukan saldomu.
            </p>
          )}
        </div>
      </div>
      <div className="torn rotate-180" aria-hidden />
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rule-single first:rule-none flex flex-col gap-1 py-4 first:border-t-0 first:pt-0">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Envelope({
  label, amount, unit, accent, note, top,
}: {
  label: string; amount: string; unit: string;
  accent: string; note: string; top?: boolean;
}) {
  return (
    <div className={`${top ? "rule-double" : "rule-single"} mt-6 pt-6`}>
      <span className="label">{label}</span>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="figure" style={{ color: accent }}>
          {amount}
        </span>
        <span className="label pb-1">{unit}</span>
      </div>
      <p
        className="mt-2 text-[0.8125rem] leading-relaxed"
        style={{ color: "var(--ink-soft)", fontFamily: "var(--font-sans)" }}
      >
        {note}
      </p>
    </div>
  );
}

function Footer() {
  const c = addresses.contracts;
  return (
    <footer className="rule-single mt-16 pt-6">
      <p className="label mb-3">Kontrak di Coston2</p>
      <dl className="grid gap-1 text-[0.75rem]">
        {Object.entries(c).map(([name, addr]) => (
          <div key={name} className="flex flex-wrap justify-between gap-2">
            <dt style={{ color: "var(--ink-soft)" }}>{name}</dt>
            <dd>
              <a
                href={`${EXPLORER}/address/${addr}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {addr}
              </a>
            </dd>
          </div>
        ))}
      </dl>
      <p
        className="mt-6 text-[0.75rem] leading-relaxed"
        style={{ color: "var(--ink-faint)", fontFamily: "var(--font-sans)" }}
      >
        Jaringan uji. Token tanpa nilai uang. Kontrak belum diaudit — jangan
        pernah menaruh dana sungguhan.
      </p>
    </footer>
  );
}
