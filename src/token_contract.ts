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

export class TokenContract extends SmartContract {
  @state(Field) s = State<Field>();

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
    this.s.set(Field(1));
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

  @method updateStateIfTokenIsSent(
    updateCallback: Experimental.Callback<any>,
    newState: Field
  ) {
    // Get the accountUpdate of the contract that is attempting to update the state
    // The accountUpdate must have a balance change of >= 1 to update the state
    // By using `authorize`, we witness the accountUpdate in our token contract and verify the layout to specify only 1 accountUpdate
    let update = this.experimental.authorize(
      updateCallback,
      AccountUpdate.Layout.NoChildren
    );

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

  @method transfer(from: PublicKey, to: PublicKey, value: UInt64) {
    this.experimental.token.send({ from, to, amount: value });
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
  // This method is used as a callback in the token contract to get the balance change of the zkapp
  @method approveSend(amount: UInt64) {
    this.balance.subInPlace(amount);
  }
}

export class ZkAppC extends SmartContract {
  @method approveSend(amount: UInt64) {
    this.balance.subInPlace(amount);
  }
}
