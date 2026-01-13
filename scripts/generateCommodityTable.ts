import { ethers } from "hardhat";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

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

function escapeMarkdown(text: string): string {
  // Escape special markdown characters in table cells
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

async function generateCommodityTable() {
  try {
    // Fetch commodity data
    const commodities = await fetchCommodityData();

    if (commodities.length === 0) {
      console.log("No commodities found");
      return;
    }

    // Generate markdown table
    let markdown = "# Commodity Oracle Table\n\n";
    markdown += "> 💡 **Interactive version with copy buttons available:** [commodityTable.html](./commodityTable.html)\n\n";
    markdown += "| S.No | Commodity Name | Symbol | AssetId (bytes32) |\n";
    markdown += "|------|----------------|--------|-------------------|\n";

    for (let i = 0; i < commodities.length; i++) {
      const commodity = commodities[i];
      const assetId = getAssetId(commodity.ticker);
      const name = escapeMarkdown(commodity.name);
      const symbol = escapeMarkdown(commodity.ticker);
      
      markdown += `| ${i + 1} | ${name} | ${symbol} | \`${assetId}\` |\n`;
    }

    // Generate HTML table with copy buttons
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Commodity Oracle Table</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background-color: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        thead {
            background-color: #4CAF50;
            color: white;
        }
        th {
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #e0e0e0;
        }
        tr:hover {
            background-color: #f9f9f9;
        }
        .asset-id-cell {
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        .asset-id {
            flex: 1;
            word-break: break-all;
            color: #555;
        }
        .copy-btn {
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            transition: background-color 0.3s;
            white-space: nowrap;
        }
        .copy-btn:hover {
            background-color: #45a049;
        }
        .copy-btn:active {
            background-color: #3d8b40;
        }
        .copy-btn.copied {
            background-color: #2196F3;
        }
        .symbol {
            font-weight: 600;
            color: #4CAF50;
        }
        .sno {
            text-align: center;
            font-weight: 600;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>Commodity Oracle Table</h1>
    <table>
        <thead>
            <tr>
                <th>S.No</th>
                <th>Commodity Name</th>
                <th>Symbol</th>
                <th>AssetId (bytes32)</th>
            </tr>
        </thead>
        <tbody>
`;

    for (let i = 0; i < commodities.length; i++) {
      const commodity = commodities[i];
      const assetId = getAssetId(commodity.ticker);
      const nameHtml = escapeHtml(commodity.name);
      const symbolHtml = escapeHtml(commodity.ticker);
      const assetIdEscaped = assetId.replace(/'/g, "\\'");
      
      html += `            <tr>
                <td class="sno">${i + 1}</td>
                <td>${nameHtml}</td>
                <td class="symbol">${symbolHtml}</td>
                <td>
                    <div class="asset-id-cell">
                        <span class="asset-id">${assetId}</span>
                        <button class="copy-btn" onclick="copyToClipboard('${assetIdEscaped}', this)">Copy</button>
                    </div>
                </td>
            </tr>
`;
    }

    html += `        </tbody>
    </table>
    <script>
        function copyToClipboard(text, button) {
            navigator.clipboard.writeText(text).then(function() {
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                button.classList.add('copied');
                setTimeout(function() {
                    button.textContent = originalText;
                    button.classList.remove('copied');
                }, 2000);
            }).catch(function(err) {
                console.error('Failed to copy: ', err);
                alert('Failed to copy to clipboard');
            });
        }
    </script>
</body>
</html>`;

    // Write markdown file
    const markdownPath = path.join(__dirname, "..", "commodityTable.md");
    fs.writeFileSync(markdownPath, markdown, "utf-8");

    // Write HTML file
    const htmlPath = path.join(__dirname, "..", "commodityTable.html");
    fs.writeFileSync(htmlPath, html, "utf-8");

    console.log(`\n✅ Successfully generated table with ${commodities.length} commodities`);
    console.log(`📄 Markdown file: ${markdownPath}`);
    console.log(`🌐 HTML file (with copy buttons): ${htmlPath}`);
  } catch (error: any) {
    console.error("Error generating commodity table:", error.message || error);
    throw error;
  }
}

async function main() {
  await generateCommodityTable();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

