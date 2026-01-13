import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function deployCommodityConsumer() {
  const CONTRACT_NAME = "CommodityConsumer";
  
  // Get deployer address and balance
  const [deployer] = await ethers.getSigners();
  const deployerAddress = deployer.address;
  const deployerBalance = await ethers.provider.getBalance(deployerAddress);
  const deployerBalanceInEth = ethers.formatEther(deployerBalance);
  
  console.log("Deploying CommodityConsumer...");
  console.log("Deployer Address:", deployerAddress);
  console.log("Deployer Balance:", deployerBalanceInEth, "ETH");
  
  let  oracleAddress = process.env.ORACLE_ADDRESS;
  // Validate address format
  if (!ethers.isAddress(oracleAddress)) {
    throw new Error(`Invalid oracle address: ${oracleAddress}`);
  }
  
  console.log("Oracle Address:", oracleAddress);
  
  const commodityConsumer = await ethers.deployContract(CONTRACT_NAME, [oracleAddress]);
  await commodityConsumer.waitForDeployment();
  const consumerAddress = await commodityConsumer.getAddress();
  console.log("Deployed CommodityConsumer Contract Address:", consumerAddress);
  
  // Verify the oracle was set correctly
  const setOracle = await commodityConsumer.oracle();
  console.log("Oracle set to:", setOracle);
  
  return consumerAddress;
}

async function main() {
  await deployCommodityConsumer();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

