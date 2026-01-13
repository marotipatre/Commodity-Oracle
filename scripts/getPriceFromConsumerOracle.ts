import { ethers } from "hardhat";
import { CommodityOracle } from "../typechain-types/contracts/CommodityOracle";
import { CommodityConsumer } from "../typechain-types/contracts/CommodityConsumer.sol/CommodityConsumer";

function getAssetId(ticker: string): string {
  const assetString = `${ticker}-USD`;
  return ethers.keccak256(ethers.toUtf8Bytes(assetString));
}
function formatPrice(normalizedPrice: bigint): string {
  return ethers.formatUnits(normalizedPrice, 18);
}
function formatTimestamp(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toISOString();
}

function getAgeInMinutes(timestamp: bigint): number {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const ageSeconds = now - timestamp;
  return Number(ageSeconds) / 60;
}

async function getPriceByTicker(
  ticker: string,
  useConsumer: boolean = true,
  consumerAddress?: string,
  oracleAddress?: string
) {
  const assetId = getAssetId(ticker);
  
  let id: bigint;
  let price: bigint;
  let timestamp: bigint;

  if (useConsumer && consumerAddress) {
    const CommodityConsumerFactory = await ethers.getContractFactory("CommodityConsumer");
    const consumer = CommodityConsumerFactory.attach(consumerAddress) as CommodityConsumer;
    [id, price, timestamp] = await consumer.getPriceByAssetId(assetId);
  } else if (oracleAddress) {
    const CommodityOracleFactory = await ethers.getContractFactory("CommodityOracle");
    const oracle = CommodityOracleFactory.attach(oracleAddress) as CommodityOracle;
    [id, price, timestamp] = await oracle.getLatestPrice(assetId);
  } else {
    throw new Error("Either consumerAddress or oracleAddress must be provided");
  }

  return {
    ticker,
    assetId,
    id,
    price,
    timestamp,
    priceUSD: formatPrice(price),
    formattedTimestamp: formatTimestamp(timestamp),
    ageMinutes: getAgeInMinutes(timestamp)
  };
}

async function main() {
  // Get addresses from environment or address.txt
  let consumerAddress = process.env.CONSUMER_ADDRESS;
  let oracleAddress = process.env.ORACLE_ADDRESS;
  // Validate addresses
  if (!consumerAddress && !oracleAddress) {
    throw new Error(
      "Either CONSUMER_ADDRESS or ORACLE_ADDRESS must be provided in environment variables or address.txt"
    );
  }
  const ticker = "WTI";
  try {
    const priceData = await getPriceByTicker(
      ticker,
      !!consumerAddress,
      consumerAddress,
      oracleAddress
    );

    console.log("\n📊 Price Result:\n");
    console.log(`Ticker: ${priceData.ticker}`);
    console.log(`Asset ID: ${priceData.assetId}`);
    console.log(`Price: $${priceData.priceUSD} USD`);
    console.log(`ID: ${priceData.id.toString()}`);
    console.log(`Timestamp: ${priceData.formattedTimestamp}`);
    console.log(`Age: ${priceData.ageMinutes.toFixed(2)} minutes`);

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
