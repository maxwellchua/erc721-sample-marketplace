// contracts/Market.sol
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IMarket.sol";
import "./Collectible.sol";

/**
 * NOTE: This file was influenced by the Zora AuctionHouse.sol contract.
 * The reference was https://github.com/ourzora/auction-house/blob/main/contracts/AuctionHouse.sol at commit
 * d87346f9286130af529869b8402733b1fabe885b
 *
 * The auction flow was copied and simplified to suit the project needs.
 */
contract Market is IMarket, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    Counters.Counter private _tokenIdTracker;

    // Address of the currency used by the Market
    IERC20 private _stableToken;

    Collectible private _token;

    // Address of the recipient of all revenue commissions
    address private _commissionRecipient;

    // A mapping of the extra fees per contract address.
    // _tokenFees[tokenId] = Fee
    mapping(uint256 => Fee) private _tokenFees;

    // A mapping of the extra fees per contract address.
    // _tokenFees[tokenId] = Fee
    mapping(uint256 => Sale) private _tokensForSale;

    /**
     * @dev Initializes the contract by setting the stabletoken and
     * commission recipient addresses
     */
    constructor(
        address collectibleAddress,
        address stableTokenAddress,
        address commissionRecipient
    ) {
        _token = Collectible(collectibleAddress);
        _stableToken = IERC20(stableTokenAddress);
        _commissionRecipient = commissionRecipient;
    }

    /**
     * @dev Require valid Fee values.
     */
    modifier validFee(Fee memory fee) {
        require(
            fee.commissionPercentage + fee.royaltyPercentage < 10000,
            "Market: commission and royalty rate must be less than 100"
        );
        require(
            fee.creators.length == fee.creatorPercentages.length,
            "Market: creator and shares list not equal lengths"
        );

        uint16 total = uint16(0);
        bool hasSender = false;
        for (uint256 i = 0; i < fee.creators.length; i++) {
            require(
                fee.creators[i] != address(0),
                "Market: zero address for creator"
            );
            total += fee.creatorPercentages[i];
            hasSender = hasSender || fee.creators[i] == _msgSender();
        }

        require(total == 10000, "Market: creator shares must total to 100");
        require(hasSender, "Market: caller not included in the creator list");
        _;
    }

    /**
     * @dev Require that the specified token has fees recorded.
     */
    modifier hasFees(uint256 tokenId) {
        require(
            _tokenFees[tokenId].creators.length > 0,
            "Market: token has no fees recorded"
        );
        _;
    }

    /**
     * @dev Require that the specified token is not for sale.
     */
    modifier isNotForSale(uint256 tokenId) {
        require(
            _tokensForSale[tokenId].tokenOwner == address(0),
            "Market: token is already for sale"
        );
        _;
    }

    /**
     * @dev Require that the specified token is on sale.
     */
    modifier isForSale(uint256 tokenId) {
        require(
            !_tokensForSale[tokenId].isAuction &&
                _tokensForSale[tokenId].reservePrice > 0,
            "Market: token is not for instant sale"
        );
        _;
    }

    /**
     * @dev Require that the specified token has an auction.
     */
    modifier isForAuction(uint256 tokenId) {
        require(
            _tokensForSale[tokenId].isAuction &&
                _tokensForSale[tokenId].auctionStartTime != 0,
            "Market: token is not for auction"
        );
        _;
    }

    /**
     * @dev Returns the commission recipient set via {setCommissionRecipient}.
     *
     * Requirements:
     * - the caller must be the owner.
     */
    function getCommissionRecipient()
        public
        view
        onlyOwner
        returns (address recipient)
    {
        return _commissionRecipient;
    }

    /**
     * @dev Set a new recipient for commissions.
     *
     * Requirements:
     * - the caller must be the owner.
     */
    function setCommissionRecipient(address commissionRecipient)
        public
        onlyOwner
        nonReentrant
    {
        require(
            commissionRecipient != address(0),
            "Market: zero address for recipient"
        );
        _commissionRecipient = commissionRecipient;
    }

    /**
     * @dev Returns the token price set.
     */
    function getTokenSalePrice(uint256 tokenId)
        public
        view
        isForSale(tokenId)
        returns (uint256)
    {
        return _tokensForSale[tokenId].reservePrice;
    }

    /**
     * @dev Returns the auction max bid or reserve price.
     */
    function getAuctionCurrentPrice(uint256 tokenId)
        public
        view
        isForAuction(tokenId)
        returns (uint256)
    {
        uint256 amount = _tokensForSale[tokenId].auctionAmount;

        if (amount == 0) {
            return _tokensForSale[tokenId].reservePrice;
        }
        return amount;
    }

    /**
     * @dev Returns the auction current highest bidder.
     */
    function getAuctionCurrentBidder(uint256 tokenId)
        public
        view
        isForAuction(tokenId)
        returns (address)
    {
        return _tokensForSale[tokenId].auctionBidder;
    }

    /**
     * @dev Validate SaleInfo values.
     */
    function _validateSaleInfo(SaleInfo memory saleInfo) private pure {
        if (saleInfo.isAuction) {
            require(
                saleInfo.auctionStartTime < saleInfo.auctionEndTime,
                "Market: invalid start and end date range"
            );
        } else {
            require(
                saleInfo.reservePrice > 0,
                "Market: price must be greater than 0"
            );
        }
    }

    /**
     * @dev Create a Sale object based on the given SaleInfo.
     */
    function _setTokenForSale(
        uint256 tokenId,
        address payable tokenOwner,
        SaleInfo memory saleInfo
    ) private {
        _tokensForSale[tokenId] = Sale({
            tokenOwner: tokenOwner,
            isAuction: saleInfo.isAuction,
            reservePrice: saleInfo.reservePrice,
            auctionStartTime: saleInfo.auctionStartTime,
            auctionEndTime: saleInfo.auctionEndTime,
            auctionAmount: uint256(0),
            auctionBidder: address(0)
        });
    }

    /**
     * @dev Create a collectible, and mints copies based on the {numTokens} specified.
     * Also adds the secondary fees and sale info if the collectible is up for sale.
     * If the sale type is via auction, only the first token is set for sale,
     * otherwise all tokens are set for instant sale.
     * Emits a {LogNewCollectibles} event.
     *
     * Requirements:
     * - must enter valid values for Fee and SaleInfo.
     */
    function createCollectible(
        string calldata baseURI,
        uint256 numTokens,
        bool forSale,
        Fee memory fee,
        SaleInfo memory saleInfo
    ) external validFee(fee) nonReentrant {
        uint256 mintId = _tokenIdTracker.current();
        bool tokenForSale = forSale;

        if (forSale) {
            _validateSaleInfo(saleInfo);
        }

        for (uint256 i = 0; i < numTokens; i++) {
            // if the sale type is via auction, only the first token is set for sale
            if (forSale && saleInfo.isAuction && i > 0) {
                tokenForSale = false;
            }

            _token.mint(
                _msgSender(),
                _tokenIdTracker.current(),
                baseURI,
                _msgSender(),
                fee.royaltyPercentage,
                tokenForSale
            );
            _tokenFees[_tokenIdTracker.current()] = fee;
            if (tokenForSale) {
                _setTokenForSale(
                    _tokenIdTracker.current(),
                    _msgSender(),
                    saleInfo
                );
            }
            _tokenIdTracker.increment();
        }

        emit LogNewCollectibles(
            address(this),
            _msgSender(),
            mintId,
            _tokenIdTracker.current() - 1
        );
    }

    /**
     * @dev Puts a token id for sale.
     * Emits a {LogCollectibleUpForSale} event.
     *
     * Requirements:
     * - tokenId must have fees recorded and is not currently for sale.
     * - must enter valid values for SaleInfo.
     * - the caller must be the owner of the token.
     */
    function putTokenForSale(uint256 tokenId, SaleInfo memory saleInfo)
        external
        hasFees(tokenId)
        isNotForSale(tokenId)
        nonReentrant
    {
        _validateSaleInfo(saleInfo);

        address tokenOwner = _token.ownerOf(tokenId);
        require(
            tokenOwner == _msgSender(),
            "Market: caller must be the owner of the token"
        );

        _setTokenForSale(tokenId, _msgSender(), saleInfo);
        _token.setForSale(tokenId);

        emit LogCollectibleUpForSale(address(this), _msgSender(), tokenId);
    }

    /**
     * @dev Removes a token id from sale.
     * If the token is for auction, it can only be removed if it has not received any bids yet.
     * Emits a {LogCollectibleRemovedFromSale} event.
     *
     * Requirements:
     * - tokenId must be for sale.
     * - the caller must be the owner of the token.
     */
    function removeTokenFromSale(uint256 tokenId) external nonReentrant {
        require(
            _tokensForSale[tokenId].tokenOwner != address(0),
            "Market: token is not for sale"
        );
        require(
            _tokensForSale[tokenId].tokenOwner == _msgSender(),
            "Market: caller must be the owner of the token"
        );
        if (_tokensForSale[tokenId].isAuction) {
            require(
                _tokensForSale[tokenId].auctionAmount == 0,
                "Market: can't cancel an auction once a bid has already been placed"
            );
        }

        delete _tokensForSale[tokenId];
        _token.removeFromSale(tokenId);

        emit LogCollectibleRemovedFromSale(
            address(this),
            _msgSender(),
            tokenId
        );
    }

    /**
     * @dev Handles division of the royalty fee to the collectible's creators
     * based on their shares.
     */
    function _handleRoyaltyDistribution(uint256 tokenId, uint256 royaltyAmount)
        private
    {
        Fee memory fee = _tokenFees[tokenId];
        for (uint256 i = 0; i < fee.creators.length; i++) {
            uint256 shareProfit = royaltyAmount
                .mul(fee.creatorPercentages[i])
                .div(10000);
            _stableToken.safeTransfer(fee.creators[i], shareProfit);
        }
    }

    /**
     * @dev Calculates the values for the commission fees and royalty fees
     * and sends the value to the correct recipients. Sends the remaining
     * amount to the tokenOwner and transfer the ownership of the token to
     * the buyer.
     */
    function _handlePaymentAndTokenTransfers(
        uint256 tokenId,
        uint256 amount,
        address tokenOwner,
        address recipient
    ) private {
        (address creator, uint256 royaltyAmount) = _token.royaltyInfo(
            tokenId,
            amount
        );
        Fee memory fee = _tokenFees[tokenId];

        // commission fee
        uint256 commissionFee = amount.mul(fee.commissionPercentage).div(10000);
        _stableToken.safeTransfer(_commissionRecipient, commissionFee);

        if (creator == tokenOwner) {
            uint256 firstSalePayment = amount.sub(commissionFee);
            _handleRoyaltyDistribution(tokenId, firstSalePayment);
        } else {
            uint256 payment = amount.sub(commissionFee).sub(royaltyAmount);
            _handleRoyaltyDistribution(tokenId, royaltyAmount);
            // payment to token owner
            _stableToken.safeTransfer(tokenOwner, payment);
        }

        // Transfer token to new owner
        _token.marketTransfer(tokenOwner, recipient, tokenId);
    }

    /**
     * @dev Transfer the amount to this contract.
     */
    function _handleIncomingPayment(uint256 amount) private {
        uint256 beforeBalance = _stableToken.balanceOf(address(this));
        _stableToken.safeTransferFrom(_msgSender(), address(this), amount);
        uint256 afterBalance = _stableToken.balanceOf(address(this));

        require(
            beforeBalance.add(amount) == afterBalance,
            "Market: token transfer call did not transfer expected amount"
        );
    }

    /**
     * @dev Sends the bid back to the previous highest bidder.
     */
    function _handleOutgoingBid(address to, uint256 amount) private {
        _stableToken.safeTransfer(to, amount);
    }

    /**
     * @dev Purchase the token for instant sale.
     *
     * Requirements:
     * - the token is on sale.
     * - the caller must not be the owner of the token.
     */
    function purchaseToken(uint256 tokenId)
        external
        isForSale(tokenId)
        nonReentrant
    {
        address tokenOwner = _tokensForSale[tokenId].tokenOwner;
        uint256 tokenPrice = _tokensForSale[tokenId].reservePrice;

        require(
            tokenOwner != _msgSender(),
            "Market: token already owned by caller"
        );

        _handleIncomingPayment(tokenPrice);
        _handlePaymentAndTokenTransfers(
            tokenId,
            tokenPrice,
            tokenOwner,
            _msgSender()
        );

        delete _tokensForSale[tokenId];
        emit LogCollectibleSold(
            address(this),
            tokenId,
            tokenOwner,
            _msgSender(),
            tokenPrice
        );
    }

    /**
     * @dev Place a bid for a token.
     * Refunds the bid of the previous bidder if any.
     *
     * Requirements:
     * - the token has an auction
     * - the auction should be ongoing
     * - the caller must not be the owner of the token.
     * - the amount should be higher than the previous bid or the reserve price.
     */
    function createBid(uint256 tokenId, uint256 bid)
        external
        isForAuction(tokenId)
        nonReentrant
    {
        Sale storage sale = _tokensForSale[tokenId];
        address tokenOwner = sale.tokenOwner;

        require(
            block.timestamp >= sale.auctionStartTime,
            "Market: auction has not started yet"
        );
        require(
            block.timestamp < sale.auctionEndTime,
            "Market: auction has already ended"
        );
        require(
            tokenOwner != _msgSender(),
            "Market: token already owned by caller"
        );
        require(
            bid >= sale.reservePrice,
            "Market: must send at least the reserve price"
        );
        require(
            bid > sale.auctionAmount,
            "Market: must send more than last bid"
        );

        if (sale.auctionBidder == _msgSender()) {
            // only deduct the amount needed to meet the new bid
            _handleIncomingPayment(bid.sub(sale.auctionAmount));
            sale.auctionAmount = bid;
        } else {
            if (sale.auctionBidder != address(0)) {
                _handleOutgoingBid(sale.auctionBidder, sale.auctionAmount);
            }
            _handleIncomingPayment(bid);
            sale.auctionAmount = bid;
            sale.auctionBidder = _msgSender();
        }
        emit LogBidCreated(address(this), tokenId, _msgSender(), bid);
    }

    /**
     * @dev End the auction of the token, handing all payments and transferring
     * ownership of the token to latest bidder.
     * Anyone can end the auction, in order to prevent the token owner from
     * "griefing" the winner.
     *
     * Requirements:
     * - the token has an auction.
     * - the auction should have already ended.
     */
    function endAuction(uint256 tokenId)
        external
        isForAuction(tokenId)
        nonReentrant
    {
        address tokenOwner = _tokensForSale[tokenId].tokenOwner;
        uint256 amount = _tokensForSale[tokenId].auctionAmount;
        address winner = _tokensForSale[tokenId].auctionBidder;

        require(
            block.timestamp >= _tokensForSale[tokenId].auctionEndTime,
            "Market: auction has not ended"
        );

        if (winner != address(0)) {
            _handlePaymentAndTokenTransfers(
                tokenId,
                amount,
                tokenOwner,
                winner
            );
        }

        delete _tokensForSale[tokenId];
        emit LogAuctionEnded(
            address(this),
            tokenId,
            tokenOwner,
            winner,
            amount
        );
    }
}
