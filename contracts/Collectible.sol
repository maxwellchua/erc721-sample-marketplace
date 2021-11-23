// contracts/Collectible.sol
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Pausable.sol";

/**
 * NOTE: This file is a clone of the OpenZeppelin ERC721PresetMinterPauserAutoId.sol contract.
 * It was forked from https://github.com/OpenZeppelin/openzeppelin-contracts
 * at commit fa64a1ced0b70ab89073d5d0b6e01b0778f7e7d6
 *
 * The following functions were added and modified:
 *  - add EIP-2981: NFT Royalty Standard specification, which added:
 *    - {royalties} mapping to keep track of royalties
 *    - {creators} mapping to keep track of the original creators of the token
 *    - {royaltyInfo} function as specified by EIP-2981
 *  - add {_marketAddress} property that is declared on deployment and editable only by the owner
 *    - {setMarketAddress} revokes the roles of the previous {_marketAddress} and grants both
 *      roles to the new address
 *  - grant the {DEFAULT_ADMIN_ROLE} to the owner of the contract, but grant the {MINTER_ROLE} and {PAUSER_ROLE}
 *    to the {_marketAddress}
 *  - remove token ID and URI autogeneration
 *  - add {_isApprovedOrOwnerOrMarket} function to also allow the {_marketAddress} to transfer tokens
 *    without needing the approval.
 *  - modified {safeTransferFrom} to use {_isApprovedOrOwnerOrMarket} instead of {_isApprovedOrOwner}
 *  - add {_forSale} mapping to indicate if a token is up for sale in the market contract
 *    - add {setForSale} and {removeFromSale} functions that only the market can use to change this status
 *    - modified {_beforeTokenTransfer} to prevent transferring tokens by the owner if it is {_forSale}
 *  - add {marketTransfer} callable only by the market to allow transferring of only {_forSale} tokens
 *  - modified {mint} function to initialize values for the mappings of the token id.
 */
contract Collectible is AccessControl, Ownable, ERC721Burnable, ERC721Pausable {
    using SafeMath for uint256;

    event LogMarketChanged(
        address indexed collectibleAddress,
        address newMarketAddress,
        address author
    );

    /*
     * EIP-2981: NFT Royalty Standard
     */
    // COL-02C: Usage of Interface ID Literal
    bytes4 private constant _INTERFACE_ID_ERC2981 =
        Collectible.royaltyInfo.selector;
    // COL-01C: Redundant Visibility Specifiers
    bytes32 private constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 private constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    // COL-04S: Inexplicable Value Literal
    uint256 private constant MAX_PERCENTAGE = 10000;

    // Contract address of the Market contract that can access this collectible
    address private _marketAddress;

    // A mapping to indicate if a token id is for sale on the market or not
    // _forSale[tokenId] = bool
    mapping(uint256 => bool) private _forSale;

    // A mapping to of the royalty percentage per token id
    // royalties[tokenId] = (using 2 decimals -> 10000 = 100.00, 0 = 0.00)
    // COL-02S: Incorrect Naming Convention
    mapping(uint256 => uint16) public royalties;

    // A mapping of the original creator or first minter of the token
    // creators[tokenId] = address
    // COL-02S: Incorrect Naming Convention
    mapping(uint256 => address) public creators;

    /**
     * @dev Grants `DEFAULT_ADMIN_ROLE` to the address that deploys the contract.
     *
     * Grants `MINTER_ROLE` and `PAUSER_ROLE` to the market address specified.
     */
    constructor(address marketAddress)
        ERC721("TEST ERC721", "$TEST")
    {
        // COL-01S: Inexistent Zero Address Validation
        require(
            marketAddress != address(0),
            "Collectible: zero address for market"
        );
        _marketAddress = marketAddress;

        _registerInterface(_INTERFACE_ID_ERC2981);
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, marketAddress);
        _setupRole(PAUSER_ROLE, marketAddress);
    }

    /**
     * @dev Require that the call came from the market address.
     */
    modifier onlyMarket() {
        require(
            _msgSender() == _marketAddress,
            "Collectible: caller is not the market"
        );
        _;
    }

    /**
     * @dev Returns the market address set via {setMarketAddress}.
     *
     * Requirements:
     * - the caller must be the owner.
     */
    function getMarketAddress()
        public
        view
        onlyOwner
        returns (address marketAddress)
    {
        return _marketAddress;
    }

    /**
     * @dev Set a new market address, and revoke the roles from the previous address.
     *
     * Requirements:
     * - the caller must be the owner.
     * - there should be no tokens minted.
     */
    function setMarketAddress(address marketAddress) public onlyOwner {
        require(
            marketAddress != address(0),
            "Collectible: zero address for market"
        );
        // COL-02M: Overly Centralized Single Point of Failure
        require(
            totalSupply() == 0,
            "Collectible: tokens already minted, can no longer update the market address"
        );

        revokeRole(MINTER_ROLE, _marketAddress);
        revokeRole(PAUSER_ROLE, _marketAddress);

        _marketAddress = marketAddress;
        _setupRole(MINTER_ROLE, marketAddress);
        _setupRole(PAUSER_ROLE, marketAddress);

        // COL-03S: Inexistent Event Emission
        emit LogMarketChanged(address(this), marketAddress, _msgSender());
    }

    /**
     * @dev Returns if the token is for sale on the market.
     */
    function isForSale(uint256 tokenId) public view returns (bool forSale) {
        return _forSale[tokenId];
    }

    /**
     * @dev Set a token id for sale.
     *
     * Requirements:
     * - the caller must be the market.
     */
    function setForSale(uint256 tokenId) public onlyMarket {
        _forSale[tokenId] = true;
    }

    /**
     * @dev Remove a token id from sale.
     *
     * Requirements:
     * - the caller must be the market.
     */
    function removeFromSale(uint256 tokenId) public onlyMarket {
        _forSale[tokenId] = false;
    }

    /**
     * @dev Creates a new token for `to`.
     * Additionally sets the creators, royalties and URI for the token.
     *
     * Requirements:
     * - the caller must have the {MINTER_ROLE}.
     */
    function mint(
        address to,
        uint256 tokenId,
        string memory tokenURI,
        address creator,
        uint16 royalty
    ) public virtual {
        require(
            hasRole(MINTER_ROLE, _msgSender()),
            "Collectible: must have minter role to mint"
        );
        require(
            creators[tokenId] == address(0),
            "Collectible: token is already minted"
        );
        require(bytes(tokenURI).length > 0, "Collectible: uri should be set");
        require(creator != address(0), "Collectible: zero address for creator");
        require(royalty < MAX_PERCENTAGE, "Collectible: royalty too high");

        // COL-01M: Improper Mint Execution Flow
        royalties[tokenId] = royalty;
        creators[tokenId] = creator;
        // set to false as default
        _forSale[tokenId] = false;

        _safeMint(to, tokenId);
        // _setTokenURI requires an existing id, so we mint first
        _setTokenURI(tokenId, tokenURI);
    }

    /**
     * @dev Pauses all token transfers.
     *
     * Requirements:
     * - the caller must have the `PAUSER_ROLE`.
     */
    function pause() public virtual {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "Collectible: must have pauser role to pause"
        );
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     *
     * Requirements:
     * - the caller must have the `PAUSER_ROLE`.
     */
    function unpause() public virtual {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "Collectible: must have pauser role to unpause"
        );
        _unpause();
    }

    /**
     * @dev Hook that is called before any token transfer. This includes minting
     * and burning.
     *
     * Add check prevent transfer if token is for sale on the market.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721, ERC721Pausable) {
        super._beforeTokenTransfer(from, to, tokenId);

        require(
            !_forSale[tokenId],
            "Collectible: token is currently for sale on the market"
        );
    }

    /**
     * @dev Returns whether `spender` is allowed to manage `tokenId`.
     *
     * Requirements:
     * - `tokenId` must exist.
     */
    function _isApprovedOrOwnerOrMarket(address spender, uint256 tokenId)
        internal
        view
        returns (bool)
    {
        return (_isApprovedOrOwner(spender, tokenId) ||
            spender == _marketAddress);
    }

    /**
     * @dev See {IERC721-safeTransferFrom}.
     *
     * Update require check to use {_isApprovedOrOwnerOrMarket} instead of
     * {_isApprovedOrOwner}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) public virtual override {
        require(
            _isApprovedOrOwnerOrMarket(_msgSender(), tokenId),
            "ERC721: transfer caller is not owner nor approved"
        );

        _safeTransfer(from, to, tokenId, _data);
    }

    /**
     * @dev EIP-2981: NFT Royalty Standard.
     */
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount)
    {
        require(_exists(_tokenId), "Collectible: query for nonexistent token");
        // COL-04S: Inexplicable Value Literal
        return (
            creators[_tokenId],
            (_salePrice * royalties[_tokenId]) / MAX_PERCENTAGE
        );
    }

    /**
     * @dev Function to transfer the token to the new owner.
     *
     * Requirements:
     * - the caller must be the market.
     * - token must be on sale.
     */
    function marketTransfer(
        address from,
        address to,
        uint256 tokenId
    ) external onlyMarket {
        require(
            _forSale[tokenId],
            "Collectible: token is currently not for sale on the market"
        );

        _forSale[tokenId] = false;
        safeTransferFrom(from, to, tokenId);
    }
}
