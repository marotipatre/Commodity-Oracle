import { ethers } from "hardhat";
import axios from "axios";
import { CommodityOracle } from "../typechain-types/contracts/CommodityOracle";
interface CommodityData {
  id: number;
  name: string;
  endpoint: string;
  ticker: string;
  price: string;
  icon: string;
  exchange: {
    label: string;
    name: string;
    icon: {
      url: string;
      width: number;
      height: number;
      alt: string;
    };
  };
  type: string;
}

async function fetchCommodityData(): Promise<CommodityData[]> {
  const url = "https://cms3.diadata.org/wp-json/dia/get-rwa?v=17678609400001";
  console.log("Fetching commodity data from DIA API...");
  
  try {
    const response = await axios.get<CommodityData[]>(url, {
      timeout: 30000, // 30 seconds timeout
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log(`Found ${response.data.length} commodities from API`);
    return response.data;
  } catch (error: any) {
    if (error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.code === 'ECONNABORTED') {
      console.error("Connection timeout: The API server is not responding. Please check:");
      console.error("  1. Your internet connection");
      console.error("  2. If the API endpoint is accessible: https://cms3.diadata.org");
      console.error("  3. Try again later if the API server is temporarily down");
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error("Network error: Unable to reach the API server");
    } else {
      console.error("Error fetching commodity data:", error.message || error);
    }
    throw error;
  }
}

function getAssetId(ticker: string): string {
  const assetString = `${ticker}-USD`;
  return ethers.keccak256(ethers.toUtf8Bytes(assetString));
}

function normalizePrice(price: string): bigint {
  // Convert price string to normalized value (multiply by 1e18)
  const priceFloat = parseFloat(price);
  return ethers.parseUnits(priceFloat.toFixed(18), 18);
}

async function createSignature(
  assetId: string,
  id: bigint,
  price: bigint,
  timestamp: bigint,
  contractAddress: string,
  signer: any
): Promise<string> {
  // Create message hash: keccak256(abi.encodePacked(assetId, id, price, timestamp, address(this)))
  // Using solidityPackedKeccak256 which is equivalent to keccak256(abi.encodePacked(...))
  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256", "uint256", "address"],
    [assetId, id, price, timestamp, contractAddress]
  );
  
  // The contract uses MessageHashUtils.toEthSignedMessageHash(messageHash)
  // For a bytes32, OpenZeppelin v5 does (from source code):
  // keccak256("\x19Ethereum Signed Message:\n32" + messageHash)
  // Note: "32" is the literal string "32", not uint256(32)
  // The prefix is exactly: "\x19Ethereum Signed Message:\n32" (28 bytes)
  // Then the messageHash (32 bytes) is appended
  const prefix = "\x19Ethereum Signed Message:\n32";
  const prefixBytes = ethers.toUtf8Bytes(prefix);
  const messageHashBytes = ethers.getBytes(messageHash);
  
  // Concatenate prefix + messageHash and hash
  const fullMessage = ethers.concat([prefixBytes, messageHashBytes]);
  const ethSignedMessageHash = ethers.keccak256(fullMessage);
  
  // Sign the Ethereum signed message hash (the contract will recover from this)
  const signature = signer.signingKey.sign(ethers.getBytes(ethSignedMessageHash)).serialized;
  
  return signature;
}

async function updateOracleFeed() {
  let oracleAddress = process.env.ORACLE_ADDRESS;
  if (!ethers.isAddress(oracleAddress)) {
    throw new Error(`Invalid oracle address: ${oracleAddress}`);
  }

  console.log("Oracle Address:", oracleAddress);

  // Get oracle signer
  let oracleSigner: any;
  if (process.env.ORACLE_SIGNER_PRIVATE_KEY) {
    const provider = ethers.provider;
    oracleSigner = new ethers.Wallet(process.env.ORACLE_SIGNER_PRIVATE_KEY, provider);
  } else if (process.env.PRIVATE_KEY) {
    const provider = ethers.provider;
    oracleSigner = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  } else {
    throw new Error("ORACLE_SIGNER_PRIVATE_KEY or PRIVATE_KEY environment variable is required");
  }

  console.log("Oracle Signer Address:", oracleSigner.address);

  // Get deployer (the one who will call the update function)
  const [deployer] = await ethers.getSigners();
  console.log("Deployer Address:", deployer.address);
  console.log("Deployer Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Get contract instance to verify oracle signer
  const CommodityOracleFactory = await ethers.getContractFactory("CommodityOracle");
  const oracleContract = CommodityOracleFactory.attach(oracleAddress) as CommodityOracle;
  
  // Verify the oracle signer address matches
  const contractOracleSigner = await oracleContract.oracleSigner();
  console.log("Contract Oracle Signer:", contractOracleSigner);
  
  if (contractOracleSigner.toLowerCase() !== oracleSigner.address.toLowerCase()) {
    throw new Error(
      `Oracle signer mismatch!\n` +
      `  Expected (from contract): ${contractOracleSigner}\n` +
      `  Actual (from private key): ${oracleSigner.address}\n` +
      `Please ensure ORACLE_SIGNER_PRIVATE_KEY matches the address used when deploying the contract.`
    );
  }

  // Fetch commodity data
  const commodities = await fetchCommodityData();

  if (commodities.length === 0) {
    console.log("No commodities found to update");
    return;
  }

  // Contract instance already created above for signer verification

  // Prepare arrays for bulk update
  const assetIds: string[] = [];
  const ids: bigint[] = [];
  const prices: bigint[] = [];
  const timestamps: bigint[] = [];
  const signatures: string[] = [];

  console.log("\nPreparing commodity updates...");
  console.log("=" .repeat(80));

  // Prepare all data first (without timestamps and signatures)
  const commodityData: Array<{
    commodity: CommodityData;
    assetId: string;
    id: bigint;
    price: bigint;
  }> = [];

  for (const commodity of commodities) {
    const assetId = getAssetId(commodity.ticker);
    const id = BigInt(commodity.id);
    const price = normalizePrice(commodity.price);

    commodityData.push({
      commodity,
      assetId,
      id,
      price
    });

    // Display commodity info
    console.log(`\n${commodity.name} (${commodity.ticker})`);
    console.log(`  Asset ID (bytes32): ${assetId}`);
    console.log(`  Price: ${commodity.price} USD`);
    console.log(`  Normalized Price: ${price.toString()}`);
    console.log(`  ID: ${id.toString()}`);
  }

  // Get current block timestamp right before creating signatures
  // This ensures the timestamp is fresh and won't be stale
  console.log("\n" + "=".repeat(80));
  console.log("Getting current block timestamp...");
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  const currentTimestamp = BigInt(block!.timestamp);
  console.log(`Current block timestamp: ${currentTimestamp} (block #${blockNumber})`);

  console.log("\nCreating signatures with fresh timestamp...");
  
  // Create signatures with the fresh timestamp
  for (const data of commodityData) {
    const signature = await createSignature(
      data.assetId,
      data.id,
      data.price,
      currentTimestamp,
      oracleAddress,
      oracleSigner
    );

    assetIds.push(data.assetId);
    ids.push(data.id);
    prices.push(data.price);
    timestamps.push(currentTimestamp);
    signatures.push(signature);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`\nUpdating ${commodities.length} commodities on-chain...`);

  // Call updateCommodityPricesBulk
  try {
    const tx = await oracleContract
      .connect(deployer)
      .updateCommodityPricesBulk(assetIds, ids, prices, timestamps, signatures);
    
    console.log("Transaction sent:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ SUCCESS!");
    console.log("=".repeat(80));
    console.log(`Transaction Hash: ${receipt?.hash}`);
    console.log(`Block Number: ${receipt?.blockNumber}`);
    console.log(`Gas Used: ${receipt?.gasUsed.toString()}`);
    console.log(`\nUpdated ${commodities.length} commodities successfully!`);
    
    // Display summary
    console.log("\nUpdated Commodities Summary:");
    console.log("-".repeat(80));
    for (let i = 0; i < commodities.length; i++) {
      console.log(`${i + 1}. ${commodities[i].name} (${commodities[i].ticker})`);
      console.log(`   Asset ID: ${assetIds[i]}`);
      console.log(`   Price: ${commodities[i].price} USD`);
    }
    
  } catch (error: any) {
    console.error("\n❌ Error updating prices:", error.message);
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    throw error;
  }
}

async function main() {
  await updateOracleFeed();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

