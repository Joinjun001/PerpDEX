// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {CollateralVault} from "../src/CollateralVault.sol";

contract InvariantToken is ERC20 {
    constructor() ERC20("Invariant USD", "iUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AccountingHandler is Test {
    CollateralVault internal immutable vault;
    InvariantToken internal immutable token;

    address internal immutable alice;
    address internal immutable bob;
    address internal immutable executor;
    uint256 internal tradeNonce;

    constructor(
        CollateralVault vault_,
        InvariantToken token_,
        address alice_,
        address bob_,
        address executor_
    ) {
        vault = vault_;
        token = token_;
        alice = alice_;
        bob = bob_;
        executor = executor_;
    }

    function depositAlice(uint96 rawAmount) external {
        _deposit(alice, rawAmount);
    }

    function depositBob(uint96 rawAmount) external {
        _deposit(bob, rawAmount);
    }

    function withdrawAlice(uint96 rawAmount) external {
        _withdraw(alice, rawAmount);
    }

    function withdrawBob(uint96 rawAmount) external {
        _withdraw(bob, rawAmount);
    }

    function settleAliceToBob(uint96 rawAmount) external {
        _settle(alice, bob, rawAmount);
    }

    function settleBobToAlice(uint96 rawAmount) external {
        _settle(bob, alice, rawAmount);
    }

    function _deposit(address user, uint96 rawAmount) internal {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000 ether);
        token.mint(user, amount);

        vm.startPrank(user);
        token.approve(address(vault), amount);
        vault.deposit(address(token), amount);
        vm.stopPrank();
    }

    function _withdraw(address user, uint96 rawAmount) internal {
        uint256 available = vault.balanceOf(address(token), user);
        if (available == 0) return;

        uint256 amount = bound(uint256(rawAmount), 1, available);
        vm.prank(user);
        vault.withdraw(address(token), amount);
    }

    function _settle(address from, address to, uint96 rawAmount) internal {
        uint256 available = vault.balanceOf(address(token), from);
        if (available == 0) return;

        uint256 amount = bound(uint256(rawAmount), 1, available);
        bytes32 tradeId = keccak256(abi.encode(++tradeNonce, from, to, amount));

        vm.prank(executor);
        vault.settle(address(token), from, to, amount, tradeId);
    }
}

contract AccountingInvariantTest is StdInvariant, Test {
    CollateralVault internal vault;
    InvariantToken internal token;
    AccountingHandler internal handler;

    address internal alice = makeAddr("invariant-alice");
    address internal bob = makeAddr("invariant-bob");
    address internal executor = makeAddr("invariant-executor");

    function setUp() public {
        vault = new CollateralVault(executor);
        token = new InvariantToken();
        vault.setAssetAllowed(address(token), true);

        handler = new AccountingHandler(vault, token, alice, bob, executor);
        targetContract(address(handler));
    }

    function invariant_LiabilityMatchesUserBalancesAndVaultAssets() public view {
        uint256 aliceBalance = vault.balanceOf(address(token), alice);
        uint256 bobBalance = vault.balanceOf(address(token), bob);
        uint256 liability = vault.totalLiability(address(token));

        assertEq(aliceBalance + bobBalance, liability);
        assertEq(token.balanceOf(address(vault)), liability);
    }
}
