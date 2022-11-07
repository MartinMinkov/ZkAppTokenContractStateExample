import {
  Experimental,
  Bool,
  DeployArgs,
  Field,
  Int64,
  method,
  AccountUpdate,
  Permissions,
  PublicKey,
  SmartContract,
  UInt64,
  VerificationKey,
  State,
  state,
} from 'snarkyjs';
import { addresses } from './utils.js';

export class TokenContract extends SmartContract {
  deploy(args?: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      send: Permissions.proofOrSignature(),
      receive: Permissions.proofOrSignature(),
    });
  }

  @method init() {
    let receiver = this.experimental.token.mint({
      address: this.address,
      amount: UInt64.MAXINT(),
    });
    receiver.account.isNew.assertEquals(Bool(true));
  }

  @method deployZkapp(address: PublicKey, verificationKey: VerificationKey) {
    let tokenId = this.experimental.token.id;
    let zkapp = AccountUpdate.defaultAccountUpdate(address, tokenId);
    this.experimental.authorize(zkapp);
    AccountUpdate.setValue(zkapp.update.permissions, {
      ...Permissions.default(),
      send: Permissions.proof(),
    });
    AccountUpdate.setValue(zkapp.update.verificationKey, verificationKey);
    zkapp.sign();
  }

  @method transfer(from: PublicKey, to: PublicKey, value: UInt64) {
    this.experimental.token.send({ from, to, amount: value });
  }

  @method authorize(account: AccountUpdate) {
    this.experimental.authorize(account, AccountUpdate.Layout.NoChildren);
  }

  @method authorizeCallback(cb: Experimental.Callback<any>) {
    this.experimental.authorize(cb);
    // let update = this.experimental.authorize(
    //   cb,
    //   AccountUpdate.Layout.AnyChildren
    // );
    // let balanceChange = Int64.fromObject(update.body.balanceChange);
    // balanceChange.assertEquals(0, 'Balance change must be zero');
  }

  @method getBalance(publicKey: PublicKey): UInt64 {
    let accountUpdate = AccountUpdate.create(
      publicKey,
      this.experimental.token.id
    );
    let balance = accountUpdate.account.balance.get();
    accountUpdate.account.balance.assertEquals(
      accountUpdate.account.balance.get()
    );
    return balance;
  }
}

export class ZkAppB extends SmartContract {
  @method approveSend(amount: UInt64) {
    this.balance.subInPlace(amount);
  }
}

export class ConsumeUSDCToUpdateState extends SmartContract {
  @state(Field) s = State<Field>();

  @method init() {
    this.s.set(Field(1));
  }
  // This method is used as a callback in the token contract to get the balance change of the zkapp
  @method approveSend(amount: UInt64) {
    this.balance.subInPlace(amount);
  }

  @method updateStateIfUSDCIsSent(account: PublicKey, newState: Field) {
    let tokenContract = new TokenContract(addresses.tokenContract);
    let update = AccountUpdate.defaultAccountUpdate(
      account,
      tokenContract.experimental.token.id
    );

    update.balance.subInPlace(1);
    // AccountUpdate.attachToTransaction(update);
    //this.experimental.authorize(update);
    tokenContract.authorize(update);

    // Create constraints on balance change
    let balanceChange = Int64.fromObject(update.body.balanceChange);
    balanceChange.sgn
      .isPositive()
      .assertFalse('Balance change magnitude must be negative');
    balanceChange.magnitude.assertGt(
      UInt64.from(0),
      'Balance change must be positive'
    );

    // Set the state
    this.s.set(newState);
  }
}
