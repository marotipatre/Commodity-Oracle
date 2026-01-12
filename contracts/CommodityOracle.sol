// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CommodityOracle is Ownable {

    struct PriceData {
        uint256 id;         // 12292
        uint256 price;      // normalized price
        uint256 timestamp;  // unix time
    }

    /// assetId => price data
    mapping(bytes32 => PriceData) public prices;

    address public oracleSigner;
    mapping(bytes32 => bool) public usedMessages;

    uint256 public constant MAX_DELAY = 15 minutes;

    event PriceUpdated(
        bytes32 indexed assetId,
        uint256 id,
        uint256 price,
        uint256 timestamp
    );

    constructor(address _oracleSigner) Ownable(msg.sender) {
        oracleSigner = _oracleSigner;
    }

    /// @notice Update price for a single commodity asset
    /// @param assetId The asset identifier
    /// @param id The price data ID
    /// @param price The normalized price
    /// @param timestamp The unix timestamp
    /// @param signature The signature from the oracle signer
    function updateCommodityPrice(
        bytes32 assetId,
        uint256 id,
        uint256 price,
        uint256 timestamp,
        bytes calldata signature
    ) external {
        _updatePrice(assetId, id, price, timestamp, signature);
    }

    /// @notice Update prices for multiple commodity assets in a single transaction
    /// @param assetIds Array of asset identifiers
    /// @param ids Array of price data IDs
    /// @param priceValues Array of normalized prices
    /// @param timestamps Array of unix timestamps
    /// @param signatures Array of signatures from the oracle signer
    function updateCommodityPricesBulk(
        bytes32[] calldata assetIds,
        uint256[] calldata ids,
        uint256[] calldata priceValues,
        uint256[] calldata timestamps,
        bytes[] calldata signatures
    ) external {
        require(
            assetIds.length == ids.length &&
            ids.length == priceValues.length &&
            priceValues.length == timestamps.length &&
            timestamps.length == signatures.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < assetIds.length; i++) {
            _updatePrice(
                assetIds[i],
                ids[i],
                priceValues[i],
                timestamps[i],
                signatures[i]
            );
        }
    }

    /// @notice Internal function to validate and update a single price
    /// @param assetId The asset identifier
    /// @param id The price data ID
    /// @param price The normalized price
    /// @param timestamp The unix timestamp
    /// @param signature The signature from the oracle signer
    function _updatePrice(
        bytes32 assetId,
        uint256 id,
        uint256 price,
        uint256 timestamp,
        bytes calldata signature
    ) internal {
        require(
            block.timestamp >= timestamp &&
            block.timestamp - timestamp <= MAX_DELAY,
            "Stale data"
        );

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                assetId,
                id,
                price,
                timestamp,
                address(this)
            )
        );

        require(!usedMessages[messageHash], "Replay");

        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedMessageHash, signature);

        require(signer == oracleSigner, "Invalid signer");

        usedMessages[messageHash] = true;

        prices[assetId] = PriceData({
            id: id,
            price: price,
            timestamp: timestamp
        });

        emit PriceUpdated(assetId, id, price, timestamp);
    }

    function getLatestPrice(bytes32 assetId)
        external
        view
        returns (
            uint256 id,
            uint256 price,
            uint256 timestamp
        )
    {
        PriceData memory data = prices[assetId];
        require(data.timestamp != 0, "No price");
        return (data.id, data.price, data.timestamp);
    }
}
