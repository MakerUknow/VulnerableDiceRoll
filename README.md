## License
MIT License

# Solidity Dice Game Exploit

A demonstration of exploiting a vulnerable dice game smart contract by manipulating transaction parameters to predict and control winning outcomes.

## Overview

This project demonstrates how to exploit a vulnerable dice game contract (`MockSolidityDiceGame`) by predicting and controlling the inputs used in its random number generation. The exploit takes advantage of deterministic block parameters and transaction properties that can be manipulated or predicted.

### Key Vulnerabilities
- Using block parameters (`block.timestamp`, `blockhash`) for randomness
- Predictable transaction properties (`msg.sender`, `tx.origin`, `tx.gasprice`)
- Deterministic hash calculation

## Installation

1. Clone the repository:
```bash
git clone https://github.com/MakerUknow/solidity-dice-game-exploit.git
```

2. Navigate to the project directory:
```bash
cd solidity-dice-game-exploit
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

## Usage

Run the exploit simulation:
```bash
npx hardhat run ./scripts/VulnerableDiceRoll.js
```

## How the Exploit Works

### 1. Initial Setup
- Creates a local fork of the Ethereum network using Hardhat
- Deploys the exploit contract (`MockSolidityDiceGameExploit`) sending 10 ETH to the constructor
- Deploys the target contract (`MockSolidityDiceGame`) with 10 ETH balance via the exploit contract constructor

### 2. Finding Winning Parameters
The exploit contract's `testDeterministicHashResult()` function:
- Calculates the minimum viable gas price (120% of current base fee)
- Iterates through gas prices searching for a winning combination
- Uses anticipated block parameters:
  - `block.timestamp + 12` (predicted next block time)
  - Previous block hash
  - Exploit contract's address as `msg.sender`
  - Transaction origin (local wallet EOA address)
- Stores winning parameters when found

### 3. Executing the Exploit
The script then:
1. Creates multiple transactions with the winning parameters
2. Submits them to the mempool (simulated)
3. Forces the block timestamp to match predicted value
4. Mines the transactions
5. Verifies successful exploitation through balance changes

### 4. Key Components
- **Gas Price Manipulation**: Uses specific gas prices that result in winning hash calculations
- **Timestamp Prediction**: Anticipates future block timestamps
- **Transaction Bundling**: Submits multiple transactions to maximize success rate
- **Block Parameter Control**: Uses Hardhat's VM to simulate exact mainnet conditions

## Real-World Implications

In a real-world scenario, this exploit could be executed by:
1. Deploying the exploit contract to mainnet
2. Using Flashbots or similar services to bundle transactions
3. Including builder bribes to ensure specific block parameters
4. Executing multiple transactions in a single block to drain the contract

## Security Considerations

To prevent such exploits:
- Never use block parameters with predictable values for randomness
- Implement proper random number generation (e.g., Chainlink VRF)
- Avoid reliance on transaction properties for game mechanics
- Include rate limiting and other protective measures

## Conclusion
This exploit demonstrates the potential for manipulating block parameters to control the outcome of a Solidity dice game. It highlights the importance of secure random number generation and transaction parameter control in smart contracts.

## Acknowledgments
This project was created as a learning exercise and is not intended for real-world use. It is provided for educational purposes only.
-------