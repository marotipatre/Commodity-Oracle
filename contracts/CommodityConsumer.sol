// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICommodityOracle {
    function getLatestPrice(bytes32 assetId)
        external
        view
        returns (uint256 id, uint256 price, uint256 timestamp);
}

contract CommodityConsumer {
    ICommodityOracle public oracle;

    constructor(address oracleAddress) {
        oracle = ICommodityOracle(oracleAddress);
    }

    /// @notice Get price data for a specific asset by asset ID
    /// @param assetId The asset identifier (e.g., keccak256("NG-USD"))
    /// @return id The price data ID
    /// @return price The normalized price
    /// @return timestamp The unix timestamp
    function getPriceByAssetId(bytes32 assetId)
        external
        view
        returns (uint256 id, uint256 price, uint256 timestamp)
    {
        return oracle.getLatestPrice(assetId);
    }

    /// @notice Get price data for multiple assets in a single call
    /// @param assetIds Array of asset identifiers
    /// @return ids Array of price data IDs
    /// @return prices Array of normalized prices
    /// @return timestamps Array of unix timestamps
    function getPricesByAssetIds(bytes32[] calldata assetIds)
        external
        view
        returns (
            uint256[] memory ids,
            uint256[] memory prices,
            uint256[] memory timestamps
        )
    {
        uint256 length = assetIds.length;
        ids = new uint256[](length);
        prices = new uint256[](length);
        timestamps = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            (ids[i], prices[i], timestamps[i]) = oracle.getLatestPrice(
                assetIds[i]
            );
        }
    }

    /// @notice Get Natural Gas price (convenience function)
    /// @return id The price data ID
    /// @return price The normalized price
    /// @return timestamp The unix timestamp
    function getNaturalGasPrice()
        external
        view
        returns (uint256 id, uint256 price, uint256 timestamp)
    {
        bytes32 NG_USD = keccak256("NG-USD");
        return oracle.getLatestPrice(NG_USD);
    }
}
