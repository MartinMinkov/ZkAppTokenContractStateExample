import {
  Field,
  isReady,
  Mina,
  AccountUpdate,
  UInt64,
  shutdown,
  Experimental,
} from 'snarkyjs';

await isReady;

import { TokenContract, ZkAppB, ZkAppC } from './token_contract.js';

import { keys, addresses, getBalance, getState } from './utils.js';

import { Logger } from 'tslog';
const log: Logger = new Logger({ name: 'index.ts' });
let info = log.info.bind(log);
let debug = log.debug.bind(log);

let doProofs = true;
let accountFee = Mina.accountCreationFee();
let tx;

let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
Mina.setActiveInstance(Local);

let [{ privateKey: feePayerKey }] = Local.testAccounts;
let feePayerAddress = feePayerKey.toPublicKey();

debug('-------------------------------------------------');
debug('FEE PAYER\t\t\t', feePayerAddress.toBase58());
debug('TOKEN CONTRACT ADDRESS\t', addresses.tokenContract.toBase58());
debug('zkAppB ADDRESS\t\t', addresses.zkappB.toBase58());
debug('zkAppC ADDRESS\t\t', addresses.zkappC.toBase58());
debug('USER1 ADDRESS\t\t', addresses.user1.toBase58());
debug('-------------------------------------------------');

debug('compile token contract');
await TokenContract.compile();

debug('compile zkAppB and zkAppC');
await ZkAppB.compile();
await ZkAppC.compile();

debug('initialize contracts');
let tokenContract = new TokenContract(addresses.tokenContract);
let tokenId = tokenContract.experimental.token.id;

let zkAppB = new ZkAppB(addresses.zkappB, tokenId);
let zkAppC = new ZkAppC(addresses.zkappC, tokenId);

debug('deploy and initialize token contract');
tx = await Mina.transaction({ feePayerKey }, () => {
  AccountUpdate.createSigned(feePayerKey).balance.subInPlace(accountFee.mul(2));
  tokenContract.deploy();
  tokenContract.init();
});
await tx.prove();
tx.sign([keys.tokenContract]);
await tx.send();

info(
  `TokenContract token balance: ${getBalance(addresses.tokenContract, tokenId)}`
);
info(`TokenContract state: ${getState(addresses.tokenContract)}`);

debug('deploy zkApp contracts');
tx = await Mina.transaction(feePayerKey, () => {
  AccountUpdate.createSigned(feePayerKey).balance.subInPlace(accountFee.mul(2));
  tokenContract.deployZkapp(addresses.zkappB, ZkAppB._verificationKey!);
  tokenContract.deployZkapp(addresses.zkappC, ZkAppC._verificationKey!);
});
await tx.prove();
tx.sign([keys.zkappB, keys.zkappC]);
await tx.send();
info(
  `zkAppB token balance: ${getBalance(addresses.zkappB, tokenId)}`,
  `zkAppC token balance: ${getBalance(addresses.zkappC, tokenId)}`
);

debug('send tokens to zkAppB from token contract');
tx = await Local.transaction(feePayerKey, () => {
  tokenContract.transfer(
    addresses.tokenContract,
    addresses.zkappB,
    UInt64.from(100_000)
  );
});

await tx.prove();
tx.sign([keys.tokenContract]);
await tx.send();
info(`zkAppB token balance: ${getBalance(addresses.zkappB, tokenId)}`);

debug('alter state of token contract by paying fee in tokens from zkAppB');
tx = await Local.transaction(feePayerKey, () => {
  let authorizeSendingCallback = Experimental.Callback.create(
    zkAppB,
    'approveSend',
    [UInt64.from(1)]
  );
  tokenContract.updateStateIfTokenIsSent(authorizeSendingCallback, Field(2));
});
await tx.prove();
tx.sign([keys.zkappB]);
await tx.send();

info(`zkAppB token balance: ${getBalance(addresses.zkappB, tokenId)}`);
info(`TokenContract state: ${getState(addresses.tokenContract)}`);

debug(
  'should fail if we alter state of token contract by not paying any tokens from zkAppB'
);
try {
  tx = await Local.transaction(feePayerKey, () => {
    let authorizeSendingCallback = Experimental.Callback.create(
      zkAppB,
      'approveSend',
      [UInt64.from(0)]
    );
    tokenContract.updateStateIfTokenIsSent(authorizeSendingCallback, Field(3));
  });
  await tx.prove();
  tx.sign([keys.zkappB]);
  await tx.send();
} catch (e) {
  log.error(e);
}

info(`TokenContract state: ${getState(addresses.tokenContract)}`);

debug(
  'should fail if we alter state of token contract with no token balance from zkAppC'
);
try {
  tx = await Local.transaction(feePayerKey, () => {
    let authorizeSendingCallback = Experimental.Callback.create(
      zkAppC,
      'approveSend',
      [UInt64.from(1)]
    );
    tokenContract.updateStateIfTokenIsSent(authorizeSendingCallback, Field(4));
  });
  await tx.prove();
  tx.sign([keys.zkappC]);
  await tx.send();
} catch (e) {
  log.error(e);
}

info(`TokenContract state: ${getState(addresses.tokenContract)}`);

shutdown();
