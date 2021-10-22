## Sample Marketplace

The Market contract is set to work with a custom ERC20 token (cUSD), that is why the {stableTokenAddress} is specified in the deployment. The contract would mint ERC721 tokens using {createCollectible}, which would call the Collectible contract's {mint} function. It would record any additional fees requested for the collectible, like commission fees, royalty fees, and co-creator shares.

Tokens can be put for sale in two ways, one for instant sale, and the other for auction. For Auctions, the payment is stored in the contract first and the ERC721 token is not yet transferred. When a previous bid is beaten by a higher bid, the previous bid is refunded to their bidder. Anyone can finalize the auction, which would then transfer the token to the winner, and pays out the corresponding fees involved.

## Market.sol

The Market.sol was influenced by the Zora AuctionHouse.sol contract.
The reference was https://github.com/ourzora/auction-house/blob/main/contracts/AuctionHouse.sol at commit d87346f9286130af529869b8402733b1fabe885b

The auction flow was copied and simplified to suit the needs, and an instant buy sale option was added in.

## Collectible.sol

The Collectible.sol is a clone of the OpenZeppelin ERC721PresetMinterPauserAutoId.sol contract.
It was forked from https://github.com/OpenZeppelin/openzeppelin-contracts at commit fa64a1ced0b70ab89073d5d0b6e01b0778f7e7d6

The following functions were added and modified:

- add EIP-2981: NFT Royalty Standard specification, which added:
  - {\_royalties} mapping to keep track of royalties
  - {\_creators} mapping to keep track of the original creators of the token
  - {royaltyInfo} function as specified by EIP-2981
- add {\_marketAddress} property that is declared on deployment and editable only by the owner
  - {setMarketAddress} revokes the roles of the previous {\_marketAddress} and grants both roles to the new address
- grant the {DEFAULT_ADMIN_ROLE} to the owner of the contract, but grant the {MINTER_ROLE} and {PAUSER_ROLE} to the {\_marketAddress}
- remove token ID and URI autogeneration
- add {\_isApprovedOrOwnerOrMarket} function to also allow the {\_marketAddress} to transfer tokens without needing the approval.
- modified {safeTransferFrom} to use {\_isApprovedOrOwnerOrMarket} instead of {\_isApprovedOrOwner}
- add {\_forSale} mapping to indicate if a token is up for sale in the market contract
  - add {setForSale} and {removeFromSale} functions that only the market can use to change this status
  - modified {\_beforeTokenTransfer} to prevent transferring tokens by the owner if it is {\_forSale}
  - add {marketTransfer} callable only by the market to allow transferring of only {\_forSale} tokens
- modified {mint} function to initialize values for the mappings of the token id
