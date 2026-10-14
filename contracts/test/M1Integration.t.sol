// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {CollateralVault} from "../src/CollateralVault.sol";

contract IntegrationMockToken is ERC20 {
    constructor() ERC20("Integration USD", "iUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract M1IntegrationTest is Test {
    CollateralVault internal vault;
    IntegrationMockToken internal token;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal executor = makeAddr("executor");

    function setUp() public {
        vault = new CollateralVault(executor);
        token = new IntegrationMockToken();
        vault.setAssetAllowed(address(token), true);

        token.mint(alice, 1_000 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
    }

    function test_DepositSettleWithdrawEndToEnd() public {
        vm.prank(alice);
        vault.deposit(address(token), 100 ether);

        vm.prank(executor);
        vault.settle(address(token), alice, bob, 30 ether, keccak256("m1-integration"));

        vm.prank(alice);
        vault.withdraw(address(token), 70 ether);

        vm.prank(bob);
        vault.withdraw(address(token), 20 ether);

        assertEq(vault.balanceOf(address(token), alice), 0);
        assertEq(vault.balanceOf(address(token), bob), 10 ether);
        assertEq(vault.totalLiability(address(token)), 10 ether);
        assertEq(token.balanceOf(address(vault)), 10 ether);
        assertEq(token.balanceOf(alice), 970 ether);
        assertEq(token.balanceOf(bob), 20 ether);
    }
}
