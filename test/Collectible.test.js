// test/Market.test.js
const { expect } = require("chai");

describe("Collectible", function () {
  before(async function () {
    this.Collectible = await ethers.getContractFactory("Collectible");
  });

  beforeEach(async function () {
    const [owner] = await ethers.getSigners();
    this.collectible = await this.Collectible.deploy(owner.address);
    await this.collectible.deployed();
  });

  describe("Market Address", function () {
    it("getMarketAddress can't be called by non owner", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.collectible.connect(addr1).getMarketAddress()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("getMarketAddress returns the market address set on deploy", async function () {
      const [owner] = await ethers.getSigners();
      const marketAddress = await this.collectible.getMarketAddress();
      expect(marketAddress).to.equal(owner.address);
    });

    it("setMarketAddress can't be called by non owner", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.collectible.connect(addr1).setMarketAddress(addr1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("market address should not be the zero address", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.collectible.setMarketAddress(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("Collectible: zero address for market");
    });

    it("setMarketAddress updates the market address and revoke the roles of the previous address", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await this.collectible.setMarketAddress(addr1.address);
      const marketAddress = await this.collectible.getMarketAddress();
      expect(marketAddress).to.equal(addr1.address);

      // MINTER and PAUSER roles granted to new address
      await this.collectible
        .connect(addr1)
        .mint(
          owner.address,
          0,
          "http://localhost/token/0/",
          owner.address,
          500,
          false
        );

      await this.collectible.connect(addr1).pause();

      // MINTER and PAUSER roles revoked from previous address
      await expect(
        this.collectible.mint(
          owner.address,
          0,
          "http://localhost/token/0/",
          owner.address,
          500,
          false
        )
      ).to.be.revertedWith("Collectible: must have minter role to mint");

      await expect(this.collectible.pause()).to.be.revertedWith(
        "Collectible: must have pauser role to pause"
      );
    });
  });

  describe("Mint Token", function () {
    it("mint can't be called by an address without a MINTER ROLE", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.collectible
          .connect(addr1)
          .mint(
            owner.address,
            0,
            "http://localhost/token/0/",
            owner.address,
            500,
            false
          )
      ).to.be.revertedWith("Collectible: must have minter role to mint");
    });

    it("token uri is required", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.collectible.mint(owner.address, 0, "", owner.address, 500, false)
      ).to.be.revertedWith("Collectible: uri should be set");
    });

    it("creator should not be the zero address", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.collectible.mint(
          owner.address,
          0,
          "http://localhost/token/0/",
          "0x0000000000000000000000000000000000000000",
          500,
          false
        )
      ).to.be.revertedWith("Collectible: zero address for creator");
    });

    it("royalty percentage limits", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.collectible.mint(
          owner.address,
          0,
          "http://localhost/token/0/",
          owner.address,
          20000,
          false
        )
      ).to.be.revertedWith("Collectible: royalty too high");

      await expect(
        this.collectible.mint(
          owner.address,
          0,
          "http://localhost/token/0/",
          owner.address,
          2000000000,
          false
        )
      ).to.be.reverted; // out of bounds
    });

    it("successfully mint a token", async function () {
      const [owner] = await ethers.getSigners();
      await this.collectible.mint(
        owner.address,
        0,
        "http://localhost/token/0/",
        owner.address,
        500,
        false
      );

      const tokenOwner = await this.collectible.ownerOf(0);
      expect(tokenOwner).to.equal(owner.address);

      const tokenURI = await this.collectible.tokenURI(0);
      expect(tokenURI).to.equal("http://localhost/token/0/");
    });
  });

  describe("Royalty Info", function () {
    it("calculate correct royalty amount", async function () {
      const [owner] = await ethers.getSigners();
      await this.collectible.mint(
        owner.address,
        0,
        "http://localhost/token/0/",
        owner.address,
        1000, // 10.00 %
        false
      );

      const [receiver, amount] = await this.collectible.royaltyInfo(0, 250);
      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(25);
    });
  });

  describe("Token transfers", function () {
    beforeEach(async function () {
      const [owner] = await ethers.getSigners();
      await this.collectible.mint(
        owner.address,
        0,
        "http://localhost/token/0/",
        owner.address,
        500,
        false
      );
    });

    it("token can't be transfered when paused", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await this.collectible.pause();
      await expect(
        this.collectible["safeTransferFrom(address,address,uint256)"](
          owner.address,
          addr1.address,
          0
        )
      ).to.be.revertedWith("ERC721Pausable: token transfer while paused");

      await this.collectible.setForSale(0);

      await expect(
        this.collectible.marketTransfer(owner.address, addr1.address, 0)
      ).to.be.revertedWith("ERC721Pausable: token transfer while paused");
    });

    it("set for sale and remove from sale can't be called by non-market address", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.collectible.connect(addr1).setForSale(0)
      ).to.be.revertedWith("Collectible: caller is not the market");
      await expect(
        this.collectible.connect(addr1).removeFromSale(0)
      ).to.be.revertedWith("Collectible: caller is not the market");
    });

    it("token can't be transferred if for sale", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await this.collectible.setForSale(0);

      await expect(
        this.collectible["safeTransferFrom(address,address,uint256)"](
          owner.address,
          addr1.address,
          0
        )
      ).to.be.revertedWith(
        "Collectible: token is currently for sale on the market"
      );

      await this.collectible.removeFromSale(0);
      await this.collectible["safeTransferFrom(address,address,uint256)"](
        owner.address,
        addr1.address,
        0
      );
    });

    it("successful token transfer", async function () {
      const [owner, addr1] = await ethers.getSigners();
      const tokenOwner = await this.collectible.ownerOf(0);
      expect(tokenOwner).to.equal(owner.address);
      await this.collectible["safeTransferFrom(address,address,uint256)"](
        owner.address,
        addr1.address,
        0
      );
      const newTokenOwner = await this.collectible.ownerOf(0);
      expect(newTokenOwner).to.equal(addr1.address);
    });

    it("market can't transfer the token if it is not for sale", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.collectible.marketTransfer(owner.address, addr1.address, 0)
      ).to.be.revertedWith(
        "Collectible: token is currently not for sale on the market"
      );
    });

    it("successful market token transfer", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await this.collectible.setForSale(0);

      await this.collectible.marketTransfer(owner.address, addr1.address, 0);
      const newTokenOwner = await this.collectible.ownerOf(0);
      expect(newTokenOwner).to.equal(addr1.address);

      const forSale = await this.collectible.isForSale(0);
      expect(forSale).to.be.false;
    });
  });
});
