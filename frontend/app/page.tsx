import {
  Nav, Footer, Section, Pill, Mark, Button, Eyebrow, StepIndex, Card, ExplorerLink,
} from "@/components/ui";
import { SplitFlow } from "@/components/SplitFlow";
import { addresses } from "@/lib/duo";

/*
  Landing.

  Urutannya mengikuti pertanyaan yang muncul di kepala orang, berurutan:
  apa ini -> apakah nyata -> kenapa aku peduli -> bagaimana caranya -> kenapa
  harus Flare -> apa yang belum beres.

  Bukti transaksi sengaja ditaruh di layar pertama. Juri yang tidak pernah
  mengklik ke /app tetap harus melihat ini bukan mockup.
*/

// Transaksi sungguhan di Coston2. Angkanya bukan contoh — ini yang terjadi.
const DEMO = {
  amountIn: "40",
  secured: "1,994",
  saved: "37,900",
  securedShare: 1.994 / 40,
  xrplTx: "4EDE2F6C7E652FB8B2AC23B81924596823B6FBEACE748877FBBF7AC99FF32D99",
  flareTx: "0xd0dca79f5356e6bad3b55351f619ed882e8f4146763a78563555cf18689aa4bd",
};

export default function Landing() {
  return (
    <main>
      <Nav tone="dark" />

      {/* ---------- Hero ---------- */}
      <section
        className="px-5 pt-16 pb-24 sm:px-8 sm:pt-24"
        style={{ background: "var(--ink)", color: "var(--on-dark)" }}
      >
        <div className="mx-auto w-full max-w-[68rem]">
          <div className="rise text-center">
            <Eyebrow>Aturan untuk pembayaran XRP</Eyebrow>
            <h1 className="mx-auto mt-6 max-w-[16ch] text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.95] font-semibold tracking-tight">
              Dibayar sekali.
              <br />
              Terbagi sendiri.
            </h1>
            <p
              className="mx-auto mt-7 max-w-[46ch] text-[1.0625rem] leading-relaxed"
              style={{ color: "var(--on-dark-soft)" }}
            >
              Klien mengirim XRP seperti biasa. Kebutuhan hidupmu langsung
              dikunci dalam nilai stabil, sisanya menabung sendiri. Tanpa dompet
              baru, tanpa memasang apa pun.
            </p>
          </div>

          <div className="rise mx-auto mt-14 max-w-[42rem]" style={{ animationDelay: "0.1s" }}>
            <SplitFlow
              amountIn={DEMO.amountIn}
              unitIn="XRP"
              secured={`$${DEMO.secured}`}
              securedUnit="USDT0"
              saved={DEMO.saved}
              savedUnit="stXRP"
              securedShare={DEMO.securedShare}
            />
          </div>

          {/* Bukti, bukan klaim. */}
          <div className="rise mt-12 flex flex-col items-center gap-4" style={{ animationDelay: "0.2s" }}>
            <p className="text-[0.875rem]" style={{ color: "var(--on-dark-faint)" }}>
              Ini transaksi sungguhan di Coston2, bukan contoh:
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <ExplorerLink
                value="Pembayaran XRPL"
                href={`https://testnet.xrpl.org/transactions/${DEMO.xrplTx}`}
                tone="dark" full
              />
              <ExplorerLink
                value="Eksekusi di Flare"
                href={`https://coston2-explorer.flare.network/tx/${DEMO.flareTx}`}
                tone="dark" full
              />
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button href="/app" tone="dark">Buka aplikasi</Button>
              <Button href="#cara" tone="dark" variant="ghost">Lihat cara kerjanya</Button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Masalah ---------- */}
      <Section tone="light">
        <div className="text-center">
          <Pill>Masalahnya</Pill>
          <p className="mx-auto mt-8 max-w-[24ch] text-[clamp(1.75rem,4.5vw,3rem)] leading-[1.15] font-semibold">
            Dibayar Senin. Diurus Jumat. Nilainya sudah <Mark>turun 14%</Mark>
          </p>
          <p
            className="mx-auto mt-8 max-w-[52ch] text-[1.0625rem] leading-relaxed"
            style={{ color: "var(--on-light-soft)" }}
          >
            Kalau penghasilanmu masuk dalam bentuk kripto, kamu kehilangan uang
            karena dua hal yang sama sekali tidak ada hubungannya dengan trading.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-2">
          <Card>
            <StepIndex step={1} total={2} />
            <h3 className="mt-5 text-[1.375rem] font-semibold">Kalah oleh jam</h3>
            <p className="mt-3 text-[0.9375rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
              Klien bayar Senin. Kamu sibuk, baru sempat mengurus Jumat. Nilainya
              sudah berkurang. Tidak ada keputusan yang salah — kamu cuma sibuk.
            </p>
          </Card>
          <Card>
            <StepIndex step={2} total={2} />
            <h3 className="mt-5 text-[1.375rem] font-semibold">Tidak pernah jadi menabung</h3>
            <p className="mt-3 text-[0.9375rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
              Penghasilan masuk jadi satu tumpukan, dan tumpukan tanpa sekat
              selalu habis. Menyisihkan berarti belajar DeFi dulu, dan hampir
              tidak ada yang melakukannya.
            </p>
          </Card>
        </div>
      </Section>

      {/* ---------- Aturannya ---------- */}
      <Section tone="dark">
        <div className="grid items-start gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <Pill tone="dark">Aturannya</Pill>
            <h2 className="mt-7 text-[clamp(1.875rem,4vw,2.75rem)] leading-tight font-semibold">
              Amankan kebutuhanmu dulu. Sisanya tabung.
            </h2>
            <p className="mt-6 text-[1rem] leading-relaxed" style={{ color: "var(--on-dark-soft)" }}>
              Bukan persentase. Persentase salah di dua ujung — terlalu sedikit
              saat bayaran kecil, terlalu banyak menganggur saat bayaran besar.
              Kebutuhan hidup itu angka tetap.
            </p>
            <p className="mt-5 text-[1rem] leading-relaxed" style={{ color: "var(--on-dark-soft)" }}>
              Ini juga yang membuat oracle Flare menanggung beban sungguhan.
              Membagi 60/40 cuma aritmetika.{" "}
              <Mark color="var(--stable)">Berapa FXRP yang setara $200</Mark>{" "}
              mustahil dihitung tanpa harga hidup.
            </p>
          </div>

          <Card tone="dark">
            <table className="w-full text-left text-[0.9375rem]">
              <thead>
                <tr style={{ color: "var(--on-dark-faint)" }}>
                  <th className="pb-4 font-medium">Masuk</th>
                  <th className="pb-4 text-right font-medium">Diamankan</th>
                  <th className="pb-4 text-right font-medium">Ditabung</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {[
                  ["di bawah target", "semuanya", "—"],
                  ["$311", "$200", "$111"],
                  ["$1.039", "$200", "$839"],
                ].map(([a, b, c]) => (
                  <tr key={a} style={{ borderTop: "1px solid var(--line-dark)" }}>
                    <td className="py-4">{a}</td>
                    <td className="py-4 text-right font-semibold" style={{ color: "var(--stable)" }}>{b}</td>
                    <td className="py-4 text-right font-semibold" style={{ color: "var(--grow)" }}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-[0.8125rem] leading-relaxed" style={{ color: "var(--on-dark-faint)" }}>
              Contoh dengan target $200. Angka di halaman aplikasi dibaca langsung
              dari rantai.
            </p>
          </Card>
        </div>
      </Section>

      {/* ---------- Cara kerja ---------- */}
      <Section tone="light" id="cara">
        <div className="text-center">
          <Pill>Cara kerjanya</Pill>
          <h2 className="mx-auto mt-8 max-w-[20ch] text-[clamp(1.875rem,4.5vw,3rem)] leading-tight font-semibold">
            Satu pembayaran XRP menjalankan semuanya
          </h2>
        </div>

        <ol className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Klien bayar XRP", "Ke satu alamat, dengan catatan kecil di memo. Dari sisi klien ini transfer XRP biasa."],
            ["Flare memverifikasi", "Flare Data Connector membuktikan pembayarannya benar-benar terjadi di XRPL."],
            ["XRP jadi FXRP", "FAssets mencetaknya ke akun Flare milikmu — yang otomatis ada, tanpa didaftarkan."],
            ["Terbelah sendiri", "Harga dibaca dari oracle, kebutuhanmu ditukar jadi stabil, sisanya masuk Firelight."],
          ].map(([title, body], i) => (
            <li key={title}>
              <Card className="h-full">
                <StepIndex step={i + 1} total={4} />
                <h3 className="mt-5 text-[1.125rem] font-semibold">{title}</h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
                  {body}
                </p>
              </Card>
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-12 max-w-[54ch] text-center text-[0.9375rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
          Penerima tidak pernah memasang MetaMask, tidak pernah memegang token
          gas, dan tidak pernah meninggalkan dompet XRPL-nya.
        </p>
      </Section>

      {/* ---------- Kenapa Flare ---------- */}
      <Section tone="dark">
        <div className="mx-auto max-w-[46rem] text-center">
          <Pill tone="dark">Kenapa harus Flare</Pill>
          <p className="mt-8 text-[clamp(1.5rem,3.6vw,2.5rem)] leading-[1.25] font-semibold">
            XRP tidak bisa menjalankan smart contract. Di XRPL, pembayaran cuma
            pembayaran — <Mark>tidak bisa disuruh</Mark>
          </p>
          <p className="mt-8 text-[1.0625rem] leading-relaxed" style={{ color: "var(--on-dark-soft)" }}>
            Flare yang memberinya kemampuan itu. Jadi ini bukan soal kami memilih
            Flare — memang tidak ada jalan lain.
          </p>

          <div className="mt-14 grid gap-3 text-left sm:grid-cols-2">
            {[
              ["FAssets", "Mencetak XRP jadi FXRP, langsung dari pembayarannya"],
              ["FDC", "Membuktikan pembayaran XRPL-nya sungguhan"],
              ["Smart Accounts", "Memicu semuanya dari dompet XRPL, tanpa dompet baru"],
              ["FTSO", "Harga hidup yang menentukan pembagiannya"],
              ["Firelight", "Sisi tabungan — vault ERC-4626, FXRP jadi stXRP"],
              ["Contract Registry", "Semua alamat dibaca saat jalan, tidak ditanam"],
            ].map(([name, what]) => (
              <div key={name} className="rounded-2xl px-5 py-4" style={{ background: "var(--ink-soft)" }}>
                <p className="text-[0.9375rem] font-semibold">{name}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed" style={{ color: "var(--on-dark-soft)" }}>
                  {what}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------- Batasan ---------- */}
      <Section tone="light">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Pill>Yang belum beres</Pill>
            <h2 className="mt-7 text-[clamp(1.75rem,3.6vw,2.5rem)] leading-tight font-semibold">
              Ditulis di sini, bukan disembunyikan
            </h2>
            <p className="mt-6 text-[0.9375rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
              Yang menjatuhkan sebuah produk bukan keterbatasannya, tapi
              keterbatasan yang baru ketahuan setelah orang telanjur percaya.
            </p>
          </div>

          <dl className="grid gap-4">
            {[
              ["Belum diaudit", "Tidak ada pihak independen yang memeriksa kontraknya. Jangan pernah menaruh dana sungguhan."],
              ["Venue penukaran milik kami sendiri", "SparkDEX tidak ada di Coston2 — sudah kami cek, alamat router-nya kosong tanpa kode. Jadi tidak ada pasar FXRP↔stablecoin untuk diintegrasikan siapa pun di testnet ini. Kami membuat loketnya sendiri, harganya dari oracle Flare. Ini selesai di mainnet, dan adapter-nya sudah ditulis serta lulus tes terhadap kolam mainnet asli."],
              ["Imbal hasil nol di testnet", "Kurs vault Coston2 persis 1,000000. Kami tampilkan angka itu apa adanya, dengan kurs mainnet di sebelahnya sebagai pembanding — bukan APY karangan."],
              ["Penarikan butuh sampai 2 periode", "Firelight memproses penarikan per periode, dan permintaan kami masuk ke periode berikutnya. Bukan penarikan instan."],
              ["Belum ada pengguna", "Dibangun dari repo kosong oleh satu orang."],
            ].map(([term, desc]) => (
              <div key={term} className="rounded-2xl p-6" style={{ background: "var(--paper-soft)" }}>
                <dt className="text-[1rem] font-semibold">{term}</dt>
                <dd className="mt-2 text-[0.9375rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
                  {desc}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* ---------- Ajakan ---------- */}
      <Section tone="light" className="!pt-0">
        <div className="rounded-[2rem] px-8 py-20 text-center" style={{ background: "var(--paper-soft)" }}>
          <h2 className="mx-auto max-w-[18ch] text-[clamp(1.875rem,4.5vw,3rem)] leading-tight font-semibold">
            Lihat akun sungguhan, dengan angka sungguhan
          </h2>
          <p className="mx-auto mt-5 max-w-[42ch] text-[1rem] leading-relaxed" style={{ color: "var(--on-light-soft)" }}>
            Tidak perlu menyambungkan dompet. Membaca blockchain itu terbuka
            untuk siapa saja — alasan yang sama kenapa produknya tidak pernah
            meminta siapa pun memasang apa-apa.
          </p>
          <div className="mt-9">
            <Button href="/app">Buka aplikasi</Button>
          </div>
        </div>
      </Section>

      <Footer contracts={addresses.contracts} />
    </main>
  );
}
