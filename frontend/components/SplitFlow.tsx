/*
  Aliran yang membelah — tanda tangan halaman ini.

  Satu pembayaran masuk dari atas, lalu bercabang ke dua wadah. Tebal tiap
  cabang mengikuti proporsi sebenarnya, jadi gambar ini membawa informasi:
  sekali lihat, terlihat bahwa sebagian besar uangnya masuk tabungan.

  Digambar dengan SVG, bukan render 3D. Cairannya diwakili garis putus yang
  bergerak sepanjang jalur — cukup untuk menyampaikan "mengalir" tanpa aset
  berat, dan berhenti sendiri kalau pengguna meminta gerakan dikurangi.
*/

type Props = {
  amountIn: string;
  unitIn: string;
  secured: string;
  securedUnit: string;
  saved: string;
  savedUnit: string;
  /** Porsi yang diamankan, 0–1. Menentukan tebal cabang. */
  securedShare: number;
};

export function SplitFlow({
  amountIn, unitIn, secured, securedUnit, saved, savedUnit, securedShare,
}: Props) {
  // Tebal cabang dibatasi supaya cabang tipis tetap terlihat.
  const clamp = (n: number) => Math.min(0.88, Math.max(0.12, n));
  const s = clamp(securedShare);
  const securedW = 6 + s * 46;
  const savedW = 6 + (1 - s) * 46;

  return (
    <div className="w-full">
      <svg
        viewBox="0 0 640 400"
        className="w-full"
        role="img"
        aria-label={`${amountIn} ${unitIn} masuk, terbelah jadi ${secured} ${securedUnit} aman dan ${saved} ${savedUnit} menabung`}
      >
        <defs>
          <linearGradient id="toStable" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--on-dark-faint)" />
            <stop offset="100%" stopColor="var(--stable)" />
          </linearGradient>
          <linearGradient id="toGrow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--on-dark-faint)" />
            <stop offset="100%" stopColor="var(--grow)" />
          </linearGradient>
        </defs>

        {/* Wadah masuk */}
        <rect x="270" y="14" width="100" height="52" rx="18"
              fill="none" stroke="var(--on-dark-faint)" strokeWidth="2" />
        <text x="320" y="46" textAnchor="middle"
              className="tnum" fontSize="20" fontWeight="600" fill="var(--on-dark)">
          {amountIn}
        </text>

        {/* Batang utama */}
        <path d="M320 66 L320 150" stroke="var(--on-dark-faint)" strokeWidth="8"
              strokeLinecap="round" fill="none" />
        <path d="M320 66 L320 150" stroke="var(--on-dark)" strokeWidth="3"
              strokeLinecap="round" fill="none" className="flowing" opacity="0.7" />

        {/* Cabang kiri — porsi aman */}
        <path d="M320 150 C320 210, 170 205, 170 280"
              stroke="url(#toStable)" strokeWidth={securedW}
              strokeLinecap="round" fill="none" opacity="0.9" />
        <path d="M320 150 C320 210, 170 205, 170 280"
              stroke="var(--stable)" strokeWidth="2.5"
              strokeLinecap="round" fill="none" className="flowing" />

        {/* Cabang kanan — porsi tabungan */}
        <path d="M320 150 C320 210, 470 205, 470 280"
              stroke="url(#toGrow)" strokeWidth={savedW}
              strokeLinecap="round" fill="none" opacity="0.9" />
        <path d="M320 150 C320 210, 470 205, 470 280"
              stroke="var(--grow)" strokeWidth="2.5"
              strokeLinecap="round" fill="none" className="flowing" />

        {/* Wadah aman */}
        <rect x="70" y="280" width="200" height="86" rx="22"
              fill="none" stroke="var(--stable)" strokeWidth="2" opacity="0.55" />
        <text x="170" y="312" textAnchor="middle"
              fontSize="11" fontWeight="600" letterSpacing="1.6"
              fill="var(--on-dark-soft)">AMAN</text>
        <text x="170" y="348" textAnchor="middle"
              className="tnum" fontSize="27" fontWeight="600" fill="var(--stable)">
          {secured}
        </text>

        {/* Wadah tabungan */}
        <rect x="370" y="280" width="200" height="86" rx="22"
              fill="none" stroke="var(--grow)" strokeWidth="2" opacity="0.55" />
        <text x="470" y="312" textAnchor="middle"
              fontSize="11" fontWeight="600" letterSpacing="1.6"
              fill="var(--on-dark-soft)">MENABUNG</text>
        <text x="470" y="348" textAnchor="middle"
              className="tnum" fontSize="27" fontWeight="600" fill="var(--grow)">
          {saved}
        </text>
      </svg>

      <div className="mt-3 flex justify-between px-2 text-[0.8125rem]" style={{ color: "var(--on-dark-faint)" }}>
        <span>{securedUnit} · nilainya terkunci</span>
        <span>{savedUnit} · tumbuh sendiri</span>
      </div>
    </div>
  );
}
