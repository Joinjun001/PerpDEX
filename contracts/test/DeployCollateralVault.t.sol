// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {DeployCollateralVault} from "../script/DeployCollateralVault.s.sol";

contract DeployCollateralVaultTest is Test {
    function test_LocalDeploymentPath() public {
        address executor = makeAddr("deployment-executor");
        vm.setEnv("SETTLEMENT_EXECUTOR", vm.toString(executor));

        DeployCollateralVault deployScript = new DeployCollateralVault();
        CollateralVault vault = deployScript.run();

        assertGt(address(vault).code.length, 0);
        assertTrue(vault.hasRole(vault.SETTLEMENT_ROLE(), executor));
    }
}
