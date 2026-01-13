import { ethers } from "hardhat";

async function deployCommodityOracle() {
  const CONTRACT_NAME = "CommodityOracle";
  
  // Get deployer address and balance
  const [deployer] = await ethers.getSigners();
  const deployerAddress = deployer.address;
  const deployerBalance = await ethers.provider.getBalance(deployerAddress);
  const deployerBalanceInEth = ethers.formatEther(deployerBalance);
  
  console.log("Deploying CommodityOracle...");
  console.log("Deployer Address:", deployerAddress);
  console.log("Deployer Balance:", deployerBalanceInEth, "ETH");
  
  let oracleSignerAddress: string;
  if (process.env.ORACLE_SIGNER) {
    // Use ORACLE_SIGNER if provided (should be an address)
    oracleSignerAddress = process.env.ORACLE_SIGNER;
  } else if (process.env.PRIVATE_KEY) {
    // Derive address from private key
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    oracleSignerAddress = wallet.address;
  } else {
    throw new Error("ORACLE_SIGNER or PRIVATE_KEY environment variable is required");
  }
  console.log("Oracle Signer Address:", oracleSignerAddress);
  const commodityOracle = await ethers.deployContract(CONTRACT_NAME, [oracleSignerAddress]);
  await commodityOracle.waitForDeployment();
  const oracleAddress = await commodityOracle.getAddress();
  console.log("Deployed CommodityOracle Contract Address:", oracleAddress);
  
  // Verify the oracle signer was set correctly
  const setSigner = await commodityOracle.oracleSigner();
  console.log("Oracle Signer set to:", setSigner);
  
  return oracleAddress;
}

async function main() {
  await deployCommodityOracle();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

