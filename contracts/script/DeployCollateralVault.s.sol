// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {CollateralVault} from "../src/CollateralVault.sol";

contract DeployCollateralVault is Script {
    function run() external returns (CollateralVault vault) {
        address settlementExecutor = vm.envAddress("SETTLEMENT_EXECUTOR");

        vm.startBroadcast();
        vault = new CollateralVault(settlementExecutor);
        vm.stopBroadcast();
    }
}
