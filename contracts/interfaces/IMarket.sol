// contracts/interfaces/IMarket.sol
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface IMarket {
    struct Fee {
        uint16 commissionPercentage;
        uint16 royaltyPercentage;
        address payable[] creators;
        uint16[] creatorPercentages;
    }

    struct SaleInfo {
        bool isAuction;
        uint256 reservePrice;
        uint256 auctionStartTime;
        uint256 auctionEndTime;
    }

    struct Sale {
        address payable tokenOwner;
        bool isAuction;
        uint256 reservePrice;
        uint256 auctionStartTime;
        uint256 auctionEndTime;
        uint256 auctionAmount;
        address payable auctionBidder;
    }

    event LogNewCollectibles(
        address indexed marketAddress,
        address indexed creator,
        uint256 fromTokenId,
        uint256 toTokenId
    );

    event LogCollectibleUpForSale(
        address indexed marketAddress,
        address indexed owner,
        uint256 indexed tokenId
    );

    event LogCollectibleRemovedFromSale(
        address indexed marketAddress,
        address indexed owner,
        uint256 indexed tokenId
    );

    event LogCollectibleSold(
        address indexed marketAddress,
        uint256 indexed tokenId,
        address owner,
        address receiver,
        uint256 amount
    );

    event LogBidCreated(
        address indexed marketAddress,
        uint256 indexed tokenId,
        address bidder,
        uint256 amount
    );

    event LogAuctionEnded(
        address indexed marketAddress,
        uint256 indexed tokenId,
        address owner,
        address winner,
        uint256 amount
    );
}
