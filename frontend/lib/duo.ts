import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import deployments from "./deployments.json";

export const COSTON2_RPC = "https://coston2-api.flare.network/ext/C/rpc";
export const MAINNET_RPC = "https://flare-api.flare.network/ext/C/rpc";
export const EXPLORER = "https://coston2-explorer.flare.network";

export const MASTER_ACCOUNT_CONTROLLER =
  "0x434936d47503353f06750Db1A444DBDC5F0AD37c" as const;

// Vault Firelight di mainnet — dibaca HANYA sebagai rujukan kurs.
// Di Coston2 imbal hasil belum berjalan (kurs persis 1,000000), dan mengarang
// angka APY adalah hal yang tidak kami lakukan.
export const FIRELIGHT_MAINNET =
  "0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3" as const;

export const addresses = deployments;

const coston2 = createPublicClient({ transport: http(COSTON2_RPC) });
const mainnet = createPublicClient({ transport: http(MAINNET_RPC) });

const macAbi = parseAbi([
  "function getPersonalAccount(string) view returns (address)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);
const vaultAbi = parseAbi([
  "function targetOf(address) view returns (uint256)",
]);
const firelightAbi = parseAbi([
  "function convertToAssets(uint256) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function currentPeriodEnd() view returns (uint256)",
]);

export type Snapshot = {
  /** Alamat XRPL yang dimasukkan, atau null kalau yang dimasukkan alamat Flare. */
  xrplAddress: string | null;
  /** Akun yang saldonya dibaca. Untuk alamat XRPL ini personal account-nya. */
  personalAccount: `0x${string}`;
  targetUsd: bigint;
  stable: bigint;
  shares: bigint;
  sharesAsFxrp: bigint;
  fxrpIdle: bigint;
  coston2Rate: number;
  mainnetRate: number;
  periodEnd: number;
};

/** Format 6 desimal dengan digit tabular yang rapi. */
export const fmt6 = (v: bigint) => {
  const s = formatUnits(v, 6);
  const [a, b = ""] = s.split(".");
  return `${Number(a).toLocaleString("id-ID")},${b.padEnd(6, "0")}`;
};

export const fmtUsd = (v: bigint) =>
  `$${Number(formatUnits(v, 6)).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Alamat XRPL klasik: diawali 'r', 25–35 karakter base58. */
export const looksLikeXrplAddress = (s: string) =>
  /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s.trim());

/** Alamat Flare/EVM biasa. */
export const looksLikeFlareAddress = (s: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(s.trim());

export const looksLikeAddress = (s: string) =>
  looksLikeXrplAddress(s) || looksLikeFlareAddress(s);

export async function loadSnapshot(input: string): Promise<Snapshot> {
  const addr = input.trim();
  const isXrpl = looksLikeXrplAddress(addr);

  // Alamat XRPL diterjemahkan ke personal account-nya di Flare. Alamat Flare
  // dipakai apa adanya — aturan Duo berlaku untuk akun mana pun di Flare, dan
  // membaca saldo tidak pernah butuh izin siapa-siapa.
  const personalAccount = isXrpl
    ? await coston2.readContract({
        address: MASTER_ACCOUNT_CONTROLLER,
        abi: macAbi,
        functionName: "getPersonalAccount",
        args: [addr],
      })
    : (addr as `0x${string}`);

  const [targetUsd, stable, shares, fxrpIdle, c2Assets, c2Supply, periodEnd] =
    await Promise.all([
      coston2.readContract({
        address: addresses.contracts.DuoVault as `0x${string}`,
        abi: vaultAbi, functionName: "targetOf", args: [personalAccount],
      }),
      coston2.readContract({
        address: addresses.external.USDT0 as `0x${string}`,
        abi: erc20Abi, functionName: "balanceOf", args: [personalAccount],
      }),
      coston2.readContract({
        address: addresses.external.FirelightVault as `0x${string}`,
        abi: erc20Abi, functionName: "balanceOf", args: [personalAccount],
      }),
      coston2.readContract({
        address: addresses.external.FXRP as `0x${string}`,
        abi: erc20Abi, functionName: "balanceOf", args: [personalAccount],
      }),
      coston2.readContract({
        address: addresses.external.FirelightVault as `0x${string}`,
        abi: firelightAbi, functionName: "totalAssets",
      }),
      coston2.readContract({
        address: addresses.external.FirelightVault as `0x${string}`,
        abi: firelightAbi, functionName: "totalSupply",
      }),
      coston2.readContract({
        address: addresses.external.FirelightVault as `0x${string}`,
        abi: firelightAbi, functionName: "currentPeriodEnd",
      }),
    ]);

  const sharesAsFxrp =
    shares === BigInt(0)
      ? BigInt(0)
      : await coston2.readContract({
          address: addresses.external.FirelightVault as `0x${string}`,
          abi: firelightAbi, functionName: "convertToAssets", args: [shares],
        });

  // Kurs mainnet dibaca langsung, bukan diperkirakan.
  let mainnetRate = 1;
  try {
    const [mAssets, mSupply] = await Promise.all([
      mainnet.readContract({ address: FIRELIGHT_MAINNET, abi: firelightAbi, functionName: "totalAssets" }),
      mainnet.readContract({ address: FIRELIGHT_MAINNET, abi: firelightAbi, functionName: "totalSupply" }),
    ]);
    if (mSupply > BigInt(0)) mainnetRate = Number(mAssets) / Number(mSupply);
  } catch {
    // Kalau RPC mainnet tidak terjangkau, rujukannya disembunyikan —
    // lebih baik tidak menampilkan apa pun daripada menampilkan tebakan.
    mainnetRate = 0;
  }

  return {
    xrplAddress: isXrpl ? addr : null,
    personalAccount,
    targetUsd,
    stable,
    shares,
    sharesAsFxrp,
    fxrpIdle,
    coston2Rate: c2Supply > BigInt(0) ? Number(c2Assets) / Number(c2Supply) : 1,
    mainnetRate,
    periodEnd: Number(periodEnd),
  };
}
