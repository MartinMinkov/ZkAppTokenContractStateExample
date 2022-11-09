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
      send: Permissions.proofOrSignature(),
    });
    AccountUpdate.setValue(zkapp.update.verificationKey, verificationKey);
    zkapp.sign();
  }

  @method transfer(from: PublicKey, to: PublicKey, value: UInt64) {
    this.experimental.token.send({ from, to, amount: value });
  }

  @method authorize(account: AccountUpdate) {
    this.experimental.authorize(account);
  }

  @method authorizeStateCallback(cb: Experimental.Callback<any>) {
    let update = this.experimental.authorize(
      cb,
      AccountUpdate.Layout.NoChildren
    );
    let balanceChange = Int64.fromObject(update.body.balanceChange);
    balanceChange.assertEquals(Int64.from(0), 'Balance change must be 0');
  }

  @method authorizeCallback(
    cb: Experimental.Callback<any>,
    amount: UInt64,
    account: PublicKey
  ) {
    let tokenId = this.experimental.token.id;
    let senderUpdate = AccountUpdate.defaultAccountUpdate(account, tokenId);
    this.experimental.authorize(senderUpdate);

    senderUpdate.balance.subInPlace(amount);
    let senderBalanceChange = Int64.fromObject(senderUpdate.body.balanceChange);
    senderBalanceChange.assertEquals(Int64.from(amount).neg());
    senderUpdate.sign();

    let receiverUpdate = this.experimental.authorize(
      cb,
      AccountUpdate.Layout.NoChildren
    );
    let receiverBalanceChange = Int64.fromObject(
      receiverUpdate.body.balanceChange
    );
    receiverBalanceChange.assertEquals(Int64.from(amount));
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
  @method approveSend(amount: UInt64) {
    this.balance.subInPlace(amount);
  }

  @method updateStateIfUSDCIsSent(amount: UInt64, newState: Field) {
    // Increase the balance of the zkapp by the minimal amount
    this.balance.addInPlace(amount);

    // Create constraints on balance change
    let balanceChange = Int64.fromObject(this.self.body.balanceChange);
    balanceChange.sgn
      .isPositive()
      .assertTrue('Balance change magnitude must be positive');
    balanceChange.magnitude.assertGt(
      UInt64.from(0),
      'Balance change must be positive'
    );

    // Set the state
    this.s.set(newState);
  }
}
