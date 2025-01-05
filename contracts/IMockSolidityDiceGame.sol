// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IMockSolidityDiceGame {
    function getEthBalance() external view returns (uint);
    function rollDice() external payable;
}