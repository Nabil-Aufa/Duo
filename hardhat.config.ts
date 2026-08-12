import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const COSTON2_RPC_URL =
  process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";

// Hanya untuk fork BACA-SAJA. Tidak pernah dipakai mengirim transaksi.
const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL ?? "https://flare-api.flare.network/ext/C/rpc";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// Blok Flare Mainnet yang dipakai semua tes fork. Dipatok agar hasilnya sama
// setiap kali dijalankan. Kalau diubah, perbarui juga README.
export const FORK_BLOCK = 67_240_000;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },

  networks: {
    // Jaringan lokal, di-fork dari Flare Mainnet.
    //
    // PENTING: ini TIDAK menyambung ke mainnet untuk mengirim apa pun. Hardhat
    // hanya MEMBACA kondisi mainnet lewat RPC publik, lalu menjalankan semuanya
    // di memori komputer ini. Tidak ada transaksi yang disiarkan, tidak ada gas
    // yang dibayar, tidak ada dompet yang terlibat. Semuanya hilang saat proses
    // berhenti.
    hardhat: {
      forking: {
        url: MAINNET_RPC_URL,
        enabled: true,
        // Dipatok supaya tes deterministik dan hasilnya bisa di-cache.
        // Nomor ini dicantumkan di README sebagai bukti tes berjalan terhadap
        // likuiditas mainnet sungguhan.
        blockNumber: FORK_BLOCK,
      },
      chainId: 31337,
      // Hardhat tidak punya riwayat hardfork bawaan untuk Flare (chainId 14),
      // jadi kita beri tahu bahwa seluruh riwayatnya dijalankan di cancun.
      chains: {
        14: {
          hardforkHistory: {
            cancun: 0,
          },
        },
      },
    },

    // Satu-satunya jaringan tempat kita benar-benar mengirim transaksi.
    // Gasnya token faucet, tanpa nilai uang.
    coston2: {
      url: COSTON2_RPC_URL,
      chainId: 114,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },

    // Flare Mainnet SENGAJA tidak didaftarkan di sini.
    //
    // Tanpa entri jaringan berisi `accounts`, mengirim transaksi mainnet secara
    // teknis mustahil dari repo ini — bukan karena kita berhati-hati, tapi
    // karena alatnya memang tidak punya kuncinya. Jangan tambahkan tanpa
    // persetujuan eksplisit pemilik proyek.
  },

  etherscan: {
    apiKey: {
      coston2: "tidak-perlu-api-key",
    },
    customChains: [
      {
        network: "coston2",
        chainId: 114,
        urls: {
          apiURL: "https://coston2-explorer.flare.network/api",
          browserURL: "https://coston2-explorer.flare.network",
        },
      },
    ],
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },

  mocha: {
    timeout: 120_000, // panggilan RPC lintas jaringan bisa lambat
  },
};

export default config;
