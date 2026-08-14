"use client";

import { useState } from "react";
import {
  Nav, Footer, Pill, Eyebrow, Button, Card, Figure, ExplorerLink,
} from "@/components/ui";
import {
  loadSnapshot, looksLikeAddress, fmt6, fmtUsd,
  addresses, EXPLORER, type Snapshot,
} from "@/lib/duo";

/*
  Halaman aplikasi.

  Sengaja sederhana: satu kotak masukan, lalu dua angka. Komponennya sama
  dengan landing, jadi warnanya membawa arti yang sama — biru untuk porsi
  aman, amber untuk tabungan. Orang yang sudah melihat landing langsung
  mengenali mana yang mana.

  Tidak ada tombol sambungkan dompet, karena membaca rantai memang tidak
  butuh izin.
*/

const DEMO_ADDRESS = "rBeFawHbSXMthxWm9KvNr6rzazBW2VDyVk";

export default function AppPage() {
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
    <main style={{ background: "var(--paper)", minHeight: "100dvh" }}>
      <Nav />

      <div className="mx-auto w-full max-w-[68rem] px-5 py-16 sm:px-8 sm:py-20">
        <Pill>Lihat akun</Pill>
        <h1 className="mt-7 max-w-[18ch] text-[clamp(2rem,5vw,3.25rem)] leading-tight font-semibold">
          Masukkan alamat, lihat isinya
        </h1>
        <p className="mt-5 max-w-[48ch] text-[1rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
          Alamat XRPL atau alamat Flare. Semua angka di bawah dibaca langsung
          dari rantai — tidak ada yang disimpan di sini.
        </p>

        <form
          className="mt-9 flex max-w-[36rem] flex-col gap-3 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); look(input); }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="r… atau 0x…"
            spellCheck={false}
            autoCapitalize="none"
            aria-label="Alamat XRPL atau Flare"
            className="addr min-w-0 flex-1 rounded-full px-6 py-4 text-[0.9375rem] outline-none focus-visible:ring-2"
            style={{ background: "var(--paper-soft)", color: "var(--on-light)" }}
          />
          <button
            type="submit"
            disabled={loading}
            className="cursor-pointer rounded-full px-7 py-4 text-[0.9375rem] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: "var(--ink)", color: "var(--on-dark)" }}
          >
            {loading ? "Membaca…" : "Lihat"}
          </button>
        </form>

        <button
          onClick={() => { setInput(DEMO_ADDRESS); look(DEMO_ADDRESS); }}
          className="mt-4 cursor-pointer text-[0.875rem] underline underline-offset-4"
          style={{ color: "var(--on-light-faint)" }}
        >
          Pakai akun contoh yang sudah punya riwayat
        </button>

        {error && (
          <p className="mt-6 max-w-[48ch] text-[0.9375rem]" style={{ color: "#b3261e" }}>
            {error}
          </p>
        )}

        {snap && <Result snap={snap} />}
      </div>

      <Footer contracts={addresses.contracts} />
    </main>
  );
}

function Result({ snap }: { snap: Snapshot }) {
  const zero = BigInt(0);
  const hasActivity = snap.stable > zero || snap.shares > zero || snap.fxrpIdle > zero;

  return (
    <div className="rise mt-16">
      {/* Identitas akun */}
      <div className="grid gap-4 sm:grid-cols-2">
        {snap.xrplAddress && (
          <Card>
            <Eyebrow color="var(--on-light-faint)">Alamat XRPL</Eyebrow>
            <p className="addr mt-3 text-[0.9375rem] break-all">{snap.xrplAddress}</p>
          </Card>
        )}
        <Card>
          <Eyebrow color="var(--on-light-faint)">Akun di Flare</Eyebrow>
          <p className="mt-3">
            <ExplorerLink
              value={snap.personalAccount}
              href={`${EXPLORER}/address/${snap.personalAccount}`}
              full
            />
          </p>
          {snap.xrplAddress && (
            <p className="mt-2 text-[0.8125rem] leading-relaxed" style={{ color: "var(--on-light-faint)" }}>
              Dibuatkan otomatis untuk alamat XRPL itu. Tidak perlu didaftarkan.
            </p>
          )}
        </Card>
      </div>

      {/* Aturan */}
      <div className="mt-4 rounded-3xl p-7 sm:p-9" style={{ background: "var(--ink)", color: "var(--on-dark)" }}>
        <Eyebrow color="var(--on-dark-faint)">Aturan yang berlaku</Eyebrow>
        <p className="mt-4 text-[1.25rem] font-semibold">
          {snap.targetUsd > zero
            ? <>Amankan {fmtUsd(snap.targetUsd)} dulu. Sisanya tabung.</>
            : <>Belum diatur — semua yang masuk akan ditabung.</>}
        </p>
      </div>

      {!hasActivity ? (
        <Card className="mt-4">
          <p className="text-[1rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
            Belum ada pembayaran masuk ke akun ini. Begitu ada XRP yang tiba,
            angkanya muncul di sini.
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card>
              <Figure
                label="Aman"
                value={fmt6(snap.stable)}
                unit="USDT0"
                accent="var(--stable-ink)"
                note="Nilainya terkunci di dolar. Tidak ikut naik-turun harga XRP."
              />
            </Card>
            <Card>
              <Figure
                label="Menabung"
                value={fmt6(snap.shares)}
                unit="stXRP"
                accent="var(--grow-ink)"
                note={`Setara ${fmt6(snap.sharesAsFxrp)} FXRP pada kurs ${snap.coston2Rate.toFixed(6)}.`}
              />
            </Card>
          </div>

          {snap.fxrpIdle > zero && (
            <Card className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[0.9375rem] font-medium">Belum dibelah</span>
                <span className="tnum text-[1.125rem] font-semibold">
                  {fmt6(snap.fxrpIdle)} FXRP
                </span>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Catatan jujur */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl p-6" style={{ background: "var(--paper-soft)" }}>
          <p className="text-[0.9375rem] font-semibold">Menarik tabungan butuh waktu</p>
          <p className="mt-2 text-[0.875rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
            Sampai <strong>2 periode</strong>. Firelight memproses penarikan per
            periode, dan permintaan bisa masuk ke periode berikutnya. Bukan
            penarikan instan.
          </p>
        </div>
        {snap.mainnetRate > 0 && (
          <div className="rounded-2xl p-6" style={{ background: "var(--paper-soft)" }}>
            <p className="text-[0.9375rem] font-semibold">Imbal hasil belum berjalan di testnet</p>
            <p className="mt-2 text-[0.875rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
              Kurs di Coston2 masih <span className="tnum">{snap.coston2Rate.toFixed(6)}</span>.
              Sebagai pembanding, vault Firelight di mainnet saat ini{" "}
              <span className="tnum">{snap.mainnetRate.toFixed(6)}</span> FXRP per
              stXRP — itu angka mainnet, bukan saldomu.
            </p>
          </div>
        )}
      </div>

      <div className="mt-10">
        <Button href="/" variant="ghost">Kembali ke penjelasan</Button>
      </div>
    </div>
  );
}
