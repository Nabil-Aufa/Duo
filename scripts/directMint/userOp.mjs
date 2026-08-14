/**
 * Bentuk PackedUserOperation (ERC-4337), disalin persis dari
 * @openzeppelin/contracts/interfaces/draft-IERC4337.sol.
 *
 * PERINGATAN: ada SEMBILAN field. `paymasterAndData` duduk di antara `gasFees`
 * dan `signature`, dan gampang terlewat. Kalau satu field hilang, seluruh offset
 * bergeser dan `abi.decode` di kontrak gagal dengan panic memori
 * ("Allocated too much memory") — bukan pesan yang menunjuk ke penyebabnya.
 *
 * Definisi ini sengaja ditaruh di satu tempat supaya skrip pengirim dan skrip
 * eksekutor tidak bisa berbeda: memo mengunci hash dari data ini, jadi keduanya
 * WAJIB memakai bentuk yang sama persis.
 */
export const PACKED_USER_OP_TYPE = [
  {
    type: "tuple",
    components: [
      { name: "sender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "initCode", type: "bytes" },
      { name: "callData", type: "bytes" },
      { name: "accountGasLimits", type: "bytes32" },
      { name: "preVerificationGas", type: "uint256" },
      { name: "gasFees", type: "bytes32" },
      { name: "paymasterAndData", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
  },
];

export const ZERO_BYTES32 = "0x" + "00".repeat(32);

/** Nilai kosong untuk field yang tidak dipakai jalur Smart Accounts. */
export const emptyUserOpFields = {
  initCode: "0x",
  accountGasLimits: ZERO_BYTES32,
  preVerificationGas: 0n,
  gasFees: ZERO_BYTES32,
  paymasterAndData: "0x",
  signature: "0x",
};
