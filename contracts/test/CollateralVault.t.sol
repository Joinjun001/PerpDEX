// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {CollateralVault} from "../src/CollateralVault.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
            return;
        }
        super._update(from, to, value);
    }
}

contract CollateralVaultTest is Test {
    CollateralVault internal vault;
    MockERC20 internal token;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vault = new CollateralVault();
        token = new MockERC20();
        token.mint(alice, 1_000 ether);
        token.mint(bob, 1_000 ether);

        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    function test_DepositCreditsInternalBalanceAndLiability() public {
        vm.prank(alice);
        vault.deposit(address(token), 100 ether);

        assertEq(vault.balanceOf(address(token), alice), 100 ether);
        assertEq(vault.totalLiability(address(token)), 100 ether);
        assertEq(token.balanceOf(address(vault)), 100 ether);
    }

    function test_WithdrawDebitsInternalBalanceAndLiability() public {
        vm.startPrank(alice);
        vault.deposit(address(token), 100 ether);
        vault.withdraw(address(token), 40 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(address(token), alice), 60 ether);
        assertEq(vault.totalLiability(address(token)), 60 ether);
        assertEq(token.balanceOf(alice), 940 ether);
        assertEq(token.balanceOf(address(vault)), 60 ether);
    }

    function test_UserBalancesAreIsolated() public {
        vm.prank(alice);
        vault.deposit(address(token), 70 ether);
        vm.prank(bob);
        vault.deposit(address(token), 30 ether);

        assertEq(vault.balanceOf(address(token), alice), 70 ether);
        assertEq(vault.balanceOf(address(token), bob), 30 ether);
        assertEq(vault.totalLiability(address(token)), 100 ether);
    }

    function test_RevertWhenDepositAmountIsZero() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.deposit(address(token), 0);
    }

    function test_RevertWhenWithdrawAmountIsZero() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.withdraw(address(token), 0);
    }

    function test_RevertWhenWithdrawExceedsBalance() public {
        vm.prank(alice);
        vault.deposit(address(token), 10 ether);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CollateralVault.InsufficientBalance.selector, 10 ether, 11 ether)
        );
        vault.withdraw(address(token), 11 ether);
    }

    function test_RevertForFeeOnTransferDeposit() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 100 ether);

        vm.startPrank(alice);
        feeToken.approve(address(vault), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(
                CollateralVault.UnsupportedTransferBehavior.selector, 100 ether, 99 ether
            )
        );
        vault.deposit(address(feeToken), 100 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(address(feeToken), alice), 0);
        assertEq(vault.totalLiability(address(feeToken)), 0);
    }

    function testFuzz_DepositAndWithdrawPreserveSolvency(
        uint96 depositAmount,
        uint96 withdrawAmount
    ) public {
        depositAmount = uint96(bound(depositAmount, 1, 1_000 ether));
        withdrawAmount = uint96(bound(withdrawAmount, 0, depositAmount));

        vm.startPrank(alice);
        vault.deposit(address(token), depositAmount);
        if (withdrawAmount > 0) {
            vault.withdraw(address(token), withdrawAmount);
        }
        vm.stopPrank();

        uint256 liability = vault.totalLiability(address(token));
        assertEq(vault.balanceOf(address(token), alice), liability);
        assertEq(token.balanceOf(address(vault)), liability);
    }
}
