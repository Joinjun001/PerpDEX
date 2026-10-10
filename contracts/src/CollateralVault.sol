// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title CollateralVault
/// @notice PerpDEX 사용자의 ERC-20 collateral을 보관하고 내부 잔액을 관리한다.
contract CollateralVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAmount();
    error InsufficientBalance(uint256 available, uint256 requested);
    error UnsupportedTransferBehavior(uint256 expected, uint256 actual);

    mapping(address token => mapping(address user => uint256 amount)) private _balances;
    mapping(address token => uint256 amount) public totalLiability;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);

    function deposit(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = asset.balanceOf(address(this)) - beforeBalance;

        if (received != amount) {
            revert UnsupportedTransferBehavior(amount, received);
        }

        _balances[token][msg.sender] += amount;
        totalLiability[token] += amount;

        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 available = _balances[token][msg.sender];
        if (available < amount) revert InsufficientBalance(available, amount);

        unchecked {
            _balances[token][msg.sender] = available - amount;
            totalLiability[token] -= amount;
        }

        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    function balanceOf(address token, address user) external view returns (uint256) {
        return _balances[token][user];
    }
}
