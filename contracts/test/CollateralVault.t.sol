// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IAccessControl} from "openzeppelin-contracts/contracts/access/IAccessControl.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
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
    address internal executor = makeAddr("executor");

    function setUp() public {
        vault = new CollateralVault(executor);
        token = new MockERC20();
        vault.setAssetAllowed(address(token), true);
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

    function test_DelistedAssetCanStillBeWithdrawn() public {
        vm.prank(alice);
        vault.deposit(address(token), 100 ether);

        vault.setAssetAllowed(address(token), false);
        assertFalse(vault.isAssetAllowed(address(token)));

        vm.prank(alice);
        vault.withdraw(address(token), 40 ether);

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
        vault.setAssetAllowed(address(feeToken), true);
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

    function test_ConstructorAssignsInitialRoles() public view {
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), address(this)));
        assertTrue(vault.hasRole(vault.ASSET_MANAGER_ROLE(), address(this)));
        assertTrue(vault.hasRole(vault.PAUSER_ROLE(), address(this)));
        assertTrue(vault.hasRole(vault.SETTLEMENT_ROLE(), executor));
    }

    function test_PauserCanPauseAndUnpause() public {
        assertFalse(vault.paused());
        vault.pause();
        assertTrue(vault.paused());
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_RevertWhenPausedDeposit() public {
        vault.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        vault.deposit(address(token), 1 ether);
    }

    function test_RevertWhenPausedWithdraw() public {
        vm.prank(alice);
        vault.deposit(address(token), 10 ether);
        vault.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        vault.withdraw(address(token), 1 ether);
    }

    function test_RevertWhenPausedSettlement() public {
        vm.prank(alice);
        vault.deposit(address(token), 10 ether);
        vault.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(executor);
        vault.settle(address(token), alice, bob, 1 ether, keccak256("paused-settlement"));
    }

    function test_RevertWhenUnauthorizedCallerPauses() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                vault.PAUSER_ROLE()
            )
        );
        vm.prank(alice);
        vault.pause();
    }

    function test_AssetManagerCanUpdateAllowlist() public {
        MockERC20 otherToken = new MockERC20();

        assertFalse(vault.isAssetAllowed(address(otherToken)));
        vault.setAssetAllowed(address(otherToken), true);
        assertTrue(vault.isAssetAllowed(address(otherToken)));
        vault.setAssetAllowed(address(otherToken), false);
        assertFalse(vault.isAssetAllowed(address(otherToken)));
    }

    function test_RevertWhenUnauthorizedCallerUpdatesAllowlist() public {
        MockERC20 otherToken = new MockERC20();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                vault.ASSET_MANAGER_ROLE()
            )
        );
        vm.prank(alice);
        vault.setAssetAllowed(address(otherToken), true);
    }

    function test_RevertWhenDepositingUnsupportedAsset() public {
        MockERC20 otherToken = new MockERC20();

        vm.expectRevert(
            abi.encodeWithSelector(CollateralVault.UnsupportedAsset.selector, address(otherToken))
        );
        vm.prank(alice);
        vault.deposit(address(otherToken), 1 ether);
    }

    function test_RevertWhenSettlingUnsupportedAsset() public {
        MockERC20 otherToken = new MockERC20();

        vm.expectRevert(
            abi.encodeWithSelector(CollateralVault.UnsupportedAsset.selector, address(otherToken))
        );
        vm.prank(executor);
        vault.settle(address(otherToken), alice, bob, 1 ether, keccak256("unsupported-asset"));
    }

    function test_RevertWhenSettlementExecutorIsZero() public {
        vm.expectRevert(CollateralVault.InvalidSettlementExecutor.selector);
        new CollateralVault(address(0));
    }

    function test_SettleMovesOnlyInternalBalances() public {
        vm.prank(alice);
        vault.deposit(address(token), 100 ether);

        bytes32 tradeId = keccak256("trade-1");
        uint256 liabilityBefore = vault.totalLiability(address(token));
        uint256 vaultTokensBefore = token.balanceOf(address(vault));

        vm.prank(executor);
        vault.settle(address(token), alice, bob, 35 ether, tradeId);

        assertEq(vault.balanceOf(address(token), alice), 65 ether);
        assertEq(vault.balanceOf(address(token), bob), 35 ether);
        assertEq(vault.totalLiability(address(token)), liabilityBefore);
        assertEq(token.balanceOf(address(vault)), vaultTokensBefore);
        assertTrue(vault.settledTrades(tradeId));
    }

    function test_RevertWhenUnauthorizedCallerSettles() public {
        bytes32 tradeId = keccak256("trade-unauthorized");

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                vault.SETTLEMENT_ROLE()
            )
        );
        vm.prank(alice);
        vault.settle(address(token), alice, bob, 1 ether, tradeId);
    }

    function test_AdminCanGrantAndRevokeSettlementRole() public {
        address replacementExecutor = makeAddr("replacement-executor");
        bytes32 grantedTradeId = keccak256("trade-granted-role");
        bytes32 revokedTradeId = keccak256("trade-revoked-role");

        vault.grantRole(vault.SETTLEMENT_ROLE(), replacementExecutor);
        assertTrue(vault.hasRole(vault.SETTLEMENT_ROLE(), replacementExecutor));

        vm.prank(alice);
        vault.deposit(address(token), 10 ether);

        vm.prank(replacementExecutor);
        vault.settle(address(token), alice, bob, 1 ether, grantedTradeId);

        vault.revokeRole(vault.SETTLEMENT_ROLE(), replacementExecutor);
        assertFalse(vault.hasRole(vault.SETTLEMENT_ROLE(), replacementExecutor));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                replacementExecutor,
                vault.SETTLEMENT_ROLE()
            )
        );
        vm.prank(replacementExecutor);
        vault.settle(address(token), alice, bob, 1 ether, revokedTradeId);
    }

    function test_RevertWhenTradeIdIsReplayed() public {
        vm.prank(alice);
        vault.deposit(address(token), 100 ether);

        bytes32 tradeId = keccak256("trade-replay");
        vm.startPrank(executor);
        vault.settle(address(token), alice, bob, 10 ether, tradeId);
        vm.expectRevert(
            abi.encodeWithSelector(CollateralVault.TradeAlreadySettled.selector, tradeId)
        );
        vault.settle(address(token), alice, bob, 10 ether, tradeId);
        vm.stopPrank();
    }

    function test_RevertWhenSettlementBalanceIsInsufficient() public {
        vm.prank(alice);
        vault.deposit(address(token), 5 ether);

        bytes32 tradeId = keccak256("trade-insufficient");
        vm.prank(executor);
        vm.expectRevert(
            abi.encodeWithSelector(CollateralVault.InsufficientBalance.selector, 5 ether, 6 ether)
        );
        vault.settle(address(token), alice, bob, 6 ether, tradeId);

        assertFalse(vault.settledTrades(tradeId));
    }

    function test_RevertWhenSettlementAmountIsZero() public {
        vm.prank(executor);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.settle(address(token), alice, bob, 0, keccak256("trade-zero-amount"));
    }

    function test_RevertWhenSettlementParticipantIsZeroAddress() public {
        vm.startPrank(executor);
        vm.expectRevert(CollateralVault.InvalidParticipant.selector);
        vault.settle(address(token), address(0), bob, 1 ether, keccak256("trade-zero-from"));

        vm.expectRevert(CollateralVault.InvalidParticipant.selector);
        vault.settle(address(token), alice, address(0), 1 ether, keccak256("trade-zero-to"));
        vm.stopPrank();
    }

    function test_RevertWhenSettlementTransfersToSelf() public {
        vm.prank(executor);
        vm.expectRevert(CollateralVault.InvalidParticipant.selector);
        vault.settle(address(token), alice, alice, 1 ether, keccak256("trade-self"));
    }

    function test_RevertWhenTradeIdIsZero() public {
        vm.prank(executor);
        vm.expectRevert(CollateralVault.InvalidTradeId.selector);
        vault.settle(address(token), alice, bob, 1 ether, bytes32(0));
    }

    function testFuzz_SettlementPreservesTotalLiability(uint96 depositAmount, uint96 settleAmount)
        public
    {
        depositAmount = uint96(bound(depositAmount, 1, 1_000 ether));
        settleAmount = uint96(bound(settleAmount, 1, depositAmount));

        vm.prank(alice);
        vault.deposit(address(token), depositAmount);
        uint256 liabilityBefore = vault.totalLiability(address(token));

        bytes32 tradeId = keccak256(abi.encode(depositAmount, settleAmount));
        vm.prank(executor);
        vault.settle(address(token), alice, bob, settleAmount, tradeId);

        assertEq(vault.totalLiability(address(token)), liabilityBefore);
        assertEq(
            vault.balanceOf(address(token), alice) + vault.balanceOf(address(token), bob),
            liabilityBefore
        );
        assertEq(token.balanceOf(address(vault)), liabilityBefore);
    }
}
