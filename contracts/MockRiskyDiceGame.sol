// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockRiskyDiceGame {

    constructor() payable {}

    function getEthBalance() external view returns (uint) {
        return address(this).balance;
    }

    function generateRandomNumber() internal view returns (uint256) {
        return uint256(
            keccak256(abi.encode(msg.sender, tx.origin, block.timestamp, tx.gasprice, blockhash(block.number - 1)))
        );
    }

    function rollDice() external payable {
        require(msg.value == 1 ether);

        if (generateRandomNumber() % 6 == 5) {
            payable(msg.sender).call{value: 2 ether}("");
        }
    }

    receive() external payable {}
}