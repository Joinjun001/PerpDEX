// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";

/// @title CollateralVault
/// @notice PerpDEX 사용자의 ERC-20 collateral을 보관하고 내부 잔액을 관리한다.
contract CollateralVault is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTLEMENT_ROLE = keccak256("SETTLEMENT_ROLE");
    bytes32 public constant ASSET_MANAGER_ROLE = keccak256("ASSET_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error ZeroAmount();
    error InsufficientBalance(uint256 available, uint256 requested);
    error UnsupportedTransferBehavior(uint256 expected, uint256 actual);
    error InvalidSettlementExecutor();
    error InvalidAsset();
    error UnsupportedAsset(address token);
    error InvalidParticipant();
    error InvalidTradeId();
    error TradeAlreadySettled(bytes32 tradeId);

    mapping(address token => mapping(address user => uint256 amount)) private _balances;
    mapping(address token => uint256 amount) public totalLiability;
    mapping(address token => bool allowed) public isAssetAllowed;
    mapping(bytes32 tradeId => bool settled) public settledTrades;

    event AssetAllowedUpdated(address indexed token, bool allowed);
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Settled(
        bytes32 indexed tradeId,
        address indexed token,
        address indexed from,
        address to,
        uint256 amount
    );

    constructor(address settlementExecutor_) {
        if (settlementExecutor_ == address(0)) revert InvalidSettlementExecutor();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ASSET_MANAGER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(SETTLEMENT_ROLE, settlementExecutor_);
    }

    function setAssetAllowed(address token, bool allowed) external onlyRole(ASSET_MANAGER_ROLE) {
        if (token == address(0)) revert InvalidAsset();
        isAssetAllowed[token] = allowed;
        emit AssetAllowedUpdated(token, allowed);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (!isAssetAllowed[token]) revert UnsupportedAsset(token);
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

    function withdraw(address token, uint256 amount) external nonReentrant whenNotPaused {
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

    function settle(address token, address from, address to, uint256 amount, bytes32 tradeId)
        external
        onlyRole(SETTLEMENT_ROLE)
        whenNotPaused
    {
        if (!isAssetAllowed[token]) revert UnsupportedAsset(token);
        if (amount == 0) revert ZeroAmount();
        if (from == address(0) || to == address(0) || from == to) revert InvalidParticipant();
        if (tradeId == bytes32(0)) revert InvalidTradeId();
        if (settledTrades[tradeId]) revert TradeAlreadySettled(tradeId);

        uint256 available = _balances[token][from];
        if (available < amount) revert InsufficientBalance(available, amount);

        settledTrades[tradeId] = true;
        unchecked {
            _balances[token][from] = available - amount;
            _balances[token][to] += amount;
        }

        emit Settled(tradeId, token, from, to, amount);
    }

    function balanceOf(address token, address user) external view returns (uint256) {
        return _balances[token][user];
    }
}
