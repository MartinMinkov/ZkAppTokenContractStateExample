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

import {
  TokenContract,
  ZkAppB,
  ConsumeUSDCToUpdateState,
} from './token_contract.js';

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
debug(
  'consumeUSDCToUpdateState ADDRESS\t',
  addresses.consumeUSDCToUpdateState.toBase58()
);
debug('zkAppB ADDRESS\t\t', addresses.zkappB.toBase58());
debug('USER1 ADDRESS\t\t', addresses.user1.toBase58());
debug('-------------------------------------------------');

debug('compile token contract');
await TokenContract.compile();

debug('compile consumeUSDCToUpdateState and zkAppC');
await ZkAppB.compile();
await ConsumeUSDCToUpdateState.compile();

debug('initialize contracts');
let tokenContract = new TokenContract(addresses.tokenContract);
let tokenId = tokenContract.experimental.token.id; // This is the token ID for the USDC token -- it can be any token ID of a chosen smart contract

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
let zkAppB = new ZkAppB(addresses.zkappB, tokenId);
let consumeUSDCToUpdateState = new ConsumeUSDCToUpdateState(
  addresses.consumeUSDCToUpdateState,
  tokenId
);

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

debug('deploy zkApp contracts');
tx = await Mina.transaction(feePayerKey, () => {
  AccountUpdate.createSigned(feePayerKey).balance.subInPlace(accountFee.mul(2));
  tokenContract.deployZkapp(addresses.zkappB, ZkAppB._verificationKey!);
  tokenContract.deployZkapp(
    addresses.consumeUSDCToUpdateState,
    ConsumeUSDCToUpdateState._verificationKey!
  );
});
await tx.prove();
tx.sign([keys.zkappB, keys.consumeUSDCToUpdateState]);
await tx.send();
info(
  `zkAppB token balance: ${getBalance(addresses.zkappB, tokenId)}`,
  `consumeUSDCToUpdateState token balance: ${getBalance(
    addresses.consumeUSDCToUpdateState,
    tokenId
  )}`
);

info(
  `consumeUSDCToUpdateState state: ${getState(
    addresses.consumeUSDCToUpdateState,
    tokenId
  )}`
);

debug('consumeUSDCToUpdateState init');
tx = await Local.transaction(feePayerKey, () => {
  let update = Experimental.Callback.create(
    consumeUSDCToUpdateState,
    'init',
    []
  );
  tokenContract.approveStateCallback(update);
});
await tx.prove();
tx.sign([keys.consumeUSDCToUpdateState]);
await tx.send();
info(
  `consumeUSDCToUpdateState state: ${getState(
    addresses.consumeUSDCToUpdateState,
    tokenId
  )}`
);

debug('send tokens to consumeUSDCToUpdateState from token contract');
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

debug(
  'alter state of consumeUSDCToUpdateState by paying in USDC tokens from zkAppB'
);
tx = await Local.transaction(feePayerKey, () => {
  let amount = UInt64.from(1);

  let approveSendingCallback = Experimental.Callback.create(
    consumeUSDCToUpdateState,
    'updateStateIfUSDCIsSent',
    [amount, Field(2)]
  );
  tokenContract.approveCallback(
    approveSendingCallback,
    amount,
    addresses.zkappB
  );
});
await tx.prove();
tx.sign([keys.zkappB, keys.consumeUSDCToUpdateState, keys.tokenContract]);
await tx.send();

info(`zkAppB token balance: ${getBalance(addresses.zkappB, tokenId)}`);
info(
  `consumeUSDCToUpdateState state: ${getState(
    addresses.consumeUSDCToUpdateState,
    tokenId
  )}`
);
info(
  `consume USDCTUpdateState token balance: ${getBalance(
    addresses.consumeUSDCToUpdateState,
    tokenId
  )}`
);

shutdown();
