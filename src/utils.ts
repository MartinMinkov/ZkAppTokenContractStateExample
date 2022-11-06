import { Mina, Field, PrivateKey, PublicKey, isReady } from 'snarkyjs';

await isReady;

export let { keys, addresses } = randomAccounts(
  'tokenContract',
  'zkappB',
  'zkappC',
  'user1',
  'user2'
);

function randomAccounts<K extends string>(
  ...names: [K, ...K[]]
): { keys: Record<K, PrivateKey>; addresses: Record<K, PublicKey> } {
  let savedKeys = [
    'EKFV5T1zG13ksXKF4kDFx4bew2w4t27V3Hx1VTsbb66AKYVGL1Eu',
    'EKFE2UKugtoVMnGTxTakF2M9wwL9sp4zrxSLhuzSn32ZAYuiKh5R',
    'EKEn2s1jSNADuC8CmvCQP5CYMSSoNtx5o65H7Lahqkqp2AVdsd12',
    'EKE21kTAb37bekHbLvQpz2kvDYeKG4hB21x8VTQCbhy6m2BjFuxA',
    'EKF9JA8WiEAk7o3ENnvgMHg5XKwgQfyMowNFFrEDCevoSozSgLTn',
    'EKFZ41h3EDiTXAkwD3Mh2gVfy4CdeRGUzDPrEfXPgZR85J3KZ3WA',
  ];

  let keys = Object.fromEntries(
    names.map((name, idx) => [name, PrivateKey.fromBase58(savedKeys[idx])])
  ) as Record<K, PrivateKey>;
  let addresses = Object.fromEntries(
    names.map((name) => [name, keys[name].toPublicKey()])
  ) as Record<K, PublicKey>;
  return { keys, addresses };
}

export function getBalance(address: PublicKey, tokenId: Field) {
  return Mina.getBalance(address, tokenId).value.toBigInt();
}

export function getState(address: PublicKey, tokenId = Field(1)) {
  return Mina.getAccount(address, tokenId).appState?.[0].toString();
}
