// test/Market.test.js
const { expect } = require("chai");

describe("Market", function () {
  before(async function () {
    this.Market = await ethers.getContractFactory("Market");
    this.Collectible = await ethers.getContractFactory("Collectible");
    this.StableToken = await ethers.getContractFactory("MockStableToken");
  });

  beforeEach(async function () {
    const [owner] = await ethers.getSigners();
    this.collectible = await this.Collectible.deploy(owner.address);
    this.stableToken = await this.StableToken.deploy();
    this.market = await this.Market.deploy(
      this.collectible.address,
      this.stableToken.address,
      owner.address
    );
    await this.market.deployed();
    await this.collectible.setMarketAddress(this.market.address);
  });

  describe("Commission Recipient", function () {
    it("getCommissionRecipient can't call by non owner", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.market.connect(addr1).getCommissionRecipient()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("getCommissionRecipient returns the commission recipient set on deploy", async function () {
      const [owner] = await ethers.getSigners();
      const recipientAddress = await this.market.getCommissionRecipient();
      expect(recipientAddress).to.equal(owner.address);
    });

    it("setCommissionRecipient can't call by non owner", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.market.connect(addr1).setCommissionRecipient(owner.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("commission recipient should not be the zero address", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.setCommissionRecipient(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("Market: zero address for recipient");
    });

    it("setCommissionRecipient updates the commission recipient", async function () {
      const [owner, addr1] = await ethers.getSigners();

      const recipientAddress = await this.market.getCommissionRecipient();
      expect(recipientAddress).to.equal(owner.address);

      await this.market.setCommissionRecipient(addr1.address);
      const newRecipientAddress = await this.market.getCommissionRecipient();
      expect(newRecipientAddress).to.equal(addr1.address);
    });
  });

  describe("Create collectible", function () {
    it("token uri is required", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "",
          1,
          false,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address],
            creatorPercentages: [10000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      ).to.be.revertedWith("Market: uri should be set");
    });

    it("royalty and commission should not total to 100", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          false,
          {
            commissionPercentage: 5000,
            royaltyPercentage: 5000,
            creators: [owner.address],
            creatorPercentages: [10000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      ).to.be.revertedWith(
        "Market: commission and royalty rate must be less than 100"
      );
    });

    it("creators and creator shares should have equal lengths", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          false,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address],
            creatorPercentages: [8000, 2000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      ).to.be.revertedWith("Market: creator and shares list not equal lengths");
    });

    it("caller should be included in the creator list", async function () {
      const [owner, addr1, addr2] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          false,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [addr1.address, addr2.address],
            creatorPercentages: [5000, 5000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      ).to.be.revertedWith("Market: caller not included in the creator list");
    });

    it("creators should not be the zero address", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          false,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: ["0x0000000000000000000000000000000000000000"],
            creatorPercentages: [10000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      ).to.be.revertedWith("Market: zero address for creator");
    });

    it("creator shares should total to 100", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          false,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address, addr1.address],
            creatorPercentages: [6000, 3000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      ).to.be.revertedWith("Market: creator shares must total to 100");
    });

    it("price should be greater than 0 if the sale type is not an auction", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          true,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address, addr1.address],
            creatorPercentages: [6000, 4000],
          },
          {
            isAuction: false,
            reservePrice: 0,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      ).to.be.revertedWith("Market: price must be greater than 0");
    });

    it("auction start time should be less than the end time", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          true,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address, addr1.address],
            creatorPercentages: [6000, 4000],
          },
          {
            isAuction: true,
            reservePrice: 0,
            auctionStartTime: 6000000000,
            auctionEndTime: 3000000000,
          }
        )
      ).to.be.revertedWith("Market: invalid start and end date range");
    });

    it("successful collectible creation", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          1,
          false,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address],
            creatorPercentages: [10000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      )
        .to.emit(this.market, "LogNewCollectibles")
        .withArgs(this.market.address, owner.address, 0, 0);

      const isForSale = await this.collectible.isForSale(0);
      expect(isForSale).to.be.false;
    });

    it("successful collectibles creation with all tokens up for sale", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          3,
          true,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address],
            creatorPercentages: [10000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      )
        .to.emit(this.market, "LogNewCollectibles")
        .withArgs(this.market.address, owner.address, 0, 2);

      expect(await this.collectible.isForSale(0)).to.be.true;
      expect(await this.collectible.isForSale(1)).to.be.true;
      expect(await this.collectible.isForSale(2)).to.be.true;
      expect(await this.collectible.isForSale(3)).to.be.false;
    });

    it("successful collectibles creation with only the first token up for auction", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/0/",
          3,
          true,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address],
            creatorPercentages: [10000],
          },
          {
            isAuction: true,
            reservePrice: 10,
            auctionStartTime: 1000000,
            auctionEndTime: 3000000,
          }
        )
      )
        .to.emit(this.market, "LogNewCollectibles")
        .withArgs(this.market.address, owner.address, 0, 2);

      expect(await this.collectible.isForSale(0)).to.be.true;
      expect(await this.collectible.isForSale(1)).to.be.false;
      expect(await this.collectible.isForSale(2)).to.be.false;
      expect(await this.collectible.isForSale(3)).to.be.false;
    });

    it("successful collectible creation with correct tokenURIs", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        this.market.createCollectible(
          "http://localhost/tokens/",
          5,
          false,
          {
            commissionPercentage: 1000,
            royaltyPercentage: 1000,
            creators: [owner.address],
            creatorPercentages: [10000],
          },
          {
            isAuction: false,
            reservePrice: 10,
            auctionStartTime: 0,
            auctionEndTime: 0,
          }
        )
      )
        .to.emit(this.market, "LogNewCollectibles")
        .withArgs(this.market.address, owner.address, 0, 4);

      const uri0 = await this.collectible.tokenURI(0);
      expect(uri0).to.equal("http://localhost/tokens/");
      const uri1 = await this.collectible.tokenURI(1);
      expect(uri1).to.equal("http://localhost/tokens/");
      const uri2 = await this.collectible.tokenURI(2);
      expect(uri2).to.equal("http://localhost/tokens/");
      const uri3 = await this.collectible.tokenURI(3);
      expect(uri3).to.equal("http://localhost/tokens/");
      const uri4 = await this.collectible.tokenURI(4);
      expect(uri4).to.equal("http://localhost/tokens/");
    });
  });

  describe("Put token for sale", function () {
    beforeEach(async function () {
      const [owner] = await ethers.getSigners();
      // Id: 0 - Not for sale
      await this.market.createCollectible(
        "http://localhost/0/",
        1,
        false,
        {
          commissionPercentage: 1000,
          royaltyPercentage: 1000,
          creators: [owner.address],
          creatorPercentages: [10000],
        },
        {
          isAuction: false,
          reservePrice: 0,
          auctionStartTime: 0,
          auctionEndTime: 0,
        }
      );
      // Id: 1 - For instant sale
      await this.market.createCollectible(
        "http://localhost/0/",
        1,
        true,
        {
          commissionPercentage: 1000,
          royaltyPercentage: 1000,
          creators: [owner.address],
          creatorPercentages: [10000],
        },
        {
          isAuction: false,
          reservePrice: 10,
          auctionStartTime: 0,
          auctionEndTime: 0,
        }
      );
      // Id: 2 - For auction
      await this.market.createCollectible(
        "http://localhost/0/",
        1,
        true,
        {
          commissionPercentage: 1000,
          royaltyPercentage: 1000,
          creators: [owner.address],
          creatorPercentages: [10000],
        },
        {
          isAuction: true,
          reservePrice: 10,
          auctionStartTime: 100000,
          auctionEndTime: 200000,
        }
      );
    });

    it("token can't be put on sale if token is already for sale", async function () {
      await expect(
        this.market.putTokenForSale(1, {
          isAuction: false,
          reservePrice: 10,
          auctionStartTime: 0,
          auctionEndTime: 0,
        })
      ).to.be.revertedWith("Market: token is already for sale");

      await expect(
        this.market.putTokenForSale(2, {
          isAuction: false,
          reservePrice: 10,
          auctionStartTime: 0,
          auctionEndTime: 0,
        })
      ).to.be.revertedWith("Market: token is already for sale");
    });

    it("must enter valid sale info", async function () {
      await expect(
        this.market.putTokenForSale(0, {
          isAuction: false,
          reservePrice: 0,
          auctionStartTime: 0,
          auctionEndTime: 0,
        })
      ).to.be.revertedWith("Market: price must be greater than 0");

      await expect(
        this.market.putTokenForSale(0, {
          isAuction: true,
          reservePrice: 10,
          auctionStartTime: 4000000,
          auctionEndTime: 1000000,
        })
      ).to.be.revertedWith("Market: invalid start and end date range");
    });

    it("must be called by the owner of the token", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.market.connect(addr1).putTokenForSale(0, {
          isAuction: false,
          reservePrice: 10,
          auctionStartTime: 0,
          auctionEndTime: 0,
        })
      ).to.be.revertedWith("Market: caller must be the owner of the token");
    });

    it("successfully put the token for sale", async function () {
      const [owner] = await ethers.getSigners();
      expect(await this.collectible.isForSale(0)).to.be.false;
      await expect(
        this.market.putTokenForSale(0, {
          isAuction: false,
          reservePrice: 10,
          auctionStartTime: 0,
          auctionEndTime: 0,
        })
      )
        .to.emit(this.market, "LogCollectibleUpForSale")
        .withArgs(this.market.address, owner.address, 0);
      expect(await this.collectible.isForSale(0)).to.be.true;
      expect(await this.market.getTokenSalePrice(0)).to.equal(10);
      await expect(this.market.getAuctionCurrentPrice(0)).to.be.revertedWith(
        "Market: token is not for auction"
      );
    });

    it("successfully put the token for auction", async function () {
      const [owner] = await ethers.getSigners();
      expect(await this.collectible.isForSale(0)).to.be.false;
      await expect(
        this.market.putTokenForSale(0, {
          isAuction: true,
          reservePrice: 10,
          auctionStartTime: 100000,
          auctionEndTime: 300000,
        })
      )
        .to.emit(this.market, "LogCollectibleUpForSale")
        .withArgs(this.market.address, owner.address, 0);

      expect(await this.collectible.isForSale(0)).to.be.true;
      expect(await this.market.getAuctionCurrentPrice(0)).to.equal(10);
      await expect(this.market.getTokenSalePrice(0)).to.be.revertedWith(
        "Market: token is not for instant sale"
      );
    });
  });

  describe("Purchase token for sale", function () {
    beforeEach(async function () {
      const [owner, addr1, addr2] = await ethers.getSigners();
      await this.market.connect(addr1).createCollectible(
        "http://localhost/0/",
        1,
        true,
        {
          commissionPercentage: 1000,
          royaltyPercentage: 2000,
          creators: [addr1.address, addr2.address],
          creatorPercentages: [4000, 6000],
        },
        {
          isAuction: false,
          reservePrice: 100,
          auctionStartTime: 0,
          auctionEndTime: 0,
        }
      );
    });

    it("current owner can't buy the token", async function () {
      const [owner, addr1] = await ethers.getSigners();
      await expect(
        this.market.connect(addr1).purchaseToken(0)
      ).to.be.revertedWith("Market: token already owned by caller");
    });

    it("only the current owner can remove the token from sale", async function () {
      const [owner, addr1] = await ethers.getSigners();

      await expect(this.market.removeTokenFromSale(0)).to.be.revertedWith(
        "Market: caller must be the owner of the token"
      );

      await expect(this.market.connect(addr1).removeTokenFromSale(0))
        .to.emit(this.market, "LogCollectibleRemovedFromSale")
        .withArgs(this.market.address, addr1.address, 0);
    });

    it("must have enough balance", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await expect(
        this.market.connect(addr3).purchaseToken(0)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("must increase allowance for market to spend stable tokens", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);

      await expect(
        this.market.connect(addr3).purchaseToken(0)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      // Adding less than the amount needed
      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 50);
      expect(
        await this.stableToken.allowance(addr3.address, this.market.address)
      ).to.equal(50);
      await expect(
        this.market.connect(addr3).purchaseToken(0)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });

    it("emits an event on successful purchase", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);

      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 100);
      await expect(this.market.connect(addr3).purchaseToken(0))
        .to.emit(this.market, "LogCollectibleSold")
        .withArgs(this.market.address, 0, addr1.address, addr3.address, 100);
    });

    it("validate commissions and royalty fees for initial and secondary sale of token", async function () {
      const [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);
      await this.stableToken.transfer(addr4.address, 10000);

      expect(await this.collectible.isForSale(0)).to.be.true;
      expect(await this.collectible.ownerOf(0)).to.equal(addr1.address);

      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 100);
      await expect(() =>
        this.market.connect(addr3).purchaseToken(0)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, owner, addr1, addr2, addr3],
        [0, 10, 36, 54, -100]
      );

      expect(await this.collectible.isForSale(0)).to.be.false;
      expect(await this.collectible.ownerOf(0)).to.equal(addr3.address);
      await this.market.connect(addr3).putTokenForSale(0, {
        isAuction: false,
        reservePrice: 200,
        auctionStartTime: 0,
        auctionEndTime: 0,
      });
      expect(await this.collectible.isForSale(0)).to.be.true;

      await this.stableToken
        .connect(addr4)
        .increaseAllowance(this.market.address, 200);
      await expect(() =>
        this.market.connect(addr4).purchaseToken(0)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, owner, addr1, addr2, addr3, addr4],
        [0, 20, 16, 24, 140, -200]
      );

      expect(await this.collectible.isForSale(0)).to.be.false;
      expect(await this.collectible.ownerOf(0)).to.equal(addr4.address);
    });
  });

  describe("Auction flow", function () {
    beforeEach(async function () {
      const [owner, addr1, addr2] = await ethers.getSigners();

      const oneDay = 1 * 24 * 60 * 60;
      const twoDays = 2 * 24 * 60 * 60;
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;

      await this.market.connect(addr1).createCollectible(
        "http://localhost/0/",
        1,
        true,
        {
          commissionPercentage: 1000,
          royaltyPercentage: 2000,
          creators: [addr1.address, addr2.address],
          creatorPercentages: [4000, 6000],
        },
        {
          isAuction: true,
          reservePrice: 100,
          auctionStartTime: timestampBefore + oneDay,
          auctionEndTime: timestampBefore + twoDays,
        }
      );
    });

    it("only the current owner can remove the token from sale", async function () {
      const [owner, addr1] = await ethers.getSigners();

      await expect(this.market.removeTokenFromSale(0)).to.be.revertedWith(
        "Market: caller must be the owner of the token"
      );

      await expect(this.market.connect(addr1).removeTokenFromSale(0))
        .to.emit(this.market, "LogCollectibleRemovedFromSale")
        .withArgs(this.market.address, addr1.address, 0);
    });

    it("can't remove the token from sale if there are bids added in the auction", async function () {
      const [owner, addr1] = await ethers.getSigners();
      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken.increaseAllowance(this.market.address, 100);
      await expect(() => this.market.createBid(0, 100)).to.changeTokenBalances(
        this.stableToken,
        [this.market, owner],
        [100, -100]
      );

      await expect(
        this.market.connect(addr1).removeTokenFromSale(0)
      ).to.be.revertedWith(
        "Market: can't cancel an auction once a bid has already been placed"
      );
    });

    it("can only create a bid during the auction period", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await expect(
        this.market.connect(addr3).createBid(0, 100)
      ).to.be.revertedWith("Market: auction has not started yet");

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken.transfer(addr3.address, 10000);
      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 100);
      await expect(() =>
        this.market.connect(addr3).createBid(0, 100)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3],
        [100, -100]
      );

      const threeDays = 3 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [threeDays]);
      await ethers.provider.send("evm_mine");
      await expect(
        this.market.connect(addr3).createBid(0, 100)
      ).to.be.revertedWith("Market: auction has already ended");
    });

    it("current owner can't create a bid for the token", async function () {
      const [owner, addr1] = await ethers.getSigners();

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await expect(
        this.market.connect(addr1).createBid(0, 100)
      ).to.be.revertedWith("Market: token already owned by caller");
    });

    it("must have enough balance", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await expect(
        this.market.connect(addr3).createBid(0, 100)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("must increase allowance for market to spend stable tokens", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await expect(
        this.market.connect(addr3).createBid(0, 100)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      // Adding less than the amount needed
      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 50);
      expect(
        await this.stableToken.allowance(addr3.address, this.market.address)
      ).to.equal(50);
      await expect(
        this.market.connect(addr3).createBid(0, 100)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });

    it("must send a bid greater than the previous bid or at least the reserve price if not available", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await expect(
        this.market.connect(addr3).createBid(0, 50)
      ).to.be.revertedWith("Market: must send at least the reserve price");

      await this.stableToken.transfer(addr3.address, 10000);
      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 100);
      await expect(() =>
        this.market.connect(addr3).createBid(0, 100)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3],
        [100, -100]
      );

      await expect(
        this.market.connect(addr2).createBid(0, 100)
      ).to.be.revertedWith("Market: must send more than last bid");

      await this.stableToken.transfer(addr2.address, 10000);
      await this.stableToken
        .connect(addr2)
        .increaseAllowance(this.market.address, 101);
      await expect(() =>
        this.market.connect(addr2).createBid(0, 101)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr2, addr3],
        [1, -101, 100]
      );
      expect(await this.stableToken.balanceOf(this.market.address)).to.equal(
        101
      );
    });

    it("emits an event on successful bid", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 100);
      await expect(this.market.connect(addr3).createBid(0, 100))
        .to.emit(this.market, "LogBidCreated")
        .withArgs(this.market.address, 0, addr3.address, 100);
    });

    it("only deduct the needed amount from the user if they rebid a higher amount", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 150);
      await expect(() =>
        this.market.connect(addr3).createBid(0, 100)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3],
        [100, -100]
      );
      await expect(() =>
        this.market.connect(addr3).createBid(0, 150)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3],
        [50, -50]
      );
      expect(await this.stableToken.balanceOf(this.market.address)).to.equal(
        150
      );
    });

    it("refund previous bidder if another bidder bids a higher amount", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await this.stableToken.transfer(addr2.address, 10000);
      await this.stableToken.transfer(addr3.address, 10000);

      const oneDay = 1 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 300);
      await expect(() =>
        this.market.connect(addr3).createBid(0, 100)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3],
        [100, -100]
      );
      expect(await this.market.getAuctionCurrentBidder(0)).to.equal(
        addr3.address
      );

      await this.stableToken
        .connect(addr2)
        .increaseAllowance(this.market.address, 150);
      await expect(() =>
        this.market.connect(addr2).createBid(0, 150)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3, addr2],
        [50, 100, -150]
      );
      expect(await this.market.getAuctionCurrentBidder(0)).to.equal(
        addr2.address
      );

      await expect(() =>
        this.market.connect(addr3).createBid(0, 200)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3, addr2],
        [50, -200, 150]
      );

      expect(await this.stableToken.balanceOf(this.market.address)).to.equal(
        200
      );
      expect(await this.market.getAuctionCurrentPrice(0)).to.equal(200);
      expect(await this.market.getAuctionCurrentBidder(0)).to.equal(
        addr3.address
      );
    });

    it("anyone can end an auction but only once the end time has passed", async function () {
      const [owner, addr1, addr2, addr3] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);

      await expect(this.market.connect(addr1).endAuction(0)).to.be.revertedWith(
        "Market: auction has not ended"
      );

      const oneDay = 1 * 24 * 60 * 60;
      const twoDays = 2 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 200);
      await expect(() =>
        this.market.connect(addr3).createBid(0, 200)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3],
        [200, -200]
      );
      await ethers.provider.send("evm_increaseTime", [twoDays]);
      await ethers.provider.send("evm_mine");

      await expect(this.market.endAuction(0))
        .to.emit(this.market, "LogAuctionEnded")
        .withArgs(this.market.address, 0, addr1.address, addr3.address, 200);
    });

    it("validate commissions and royalty fees for initial and secondary sale of token", async function () {
      const [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
      await this.stableToken.transfer(addr3.address, 10000);
      await this.stableToken.transfer(addr4.address, 10000);

      expect(await this.collectible.isForSale(0)).to.be.true;
      expect(await this.collectible.ownerOf(0)).to.equal(addr1.address);

      const oneDay = 1 * 24 * 60 * 60;
      const twoDays = 2 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken
        .connect(addr3)
        .increaseAllowance(this.market.address, 150);
      await expect(() =>
        this.market.connect(addr3).createBid(0, 150)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr3],
        [150, -150]
      );

      await ethers.provider.send("evm_increaseTime", [twoDays]);
      await ethers.provider.send("evm_mine");

      await expect(() =>
        this.market.connect(addr1).endAuction(0)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, owner, addr1, addr2, addr3],
        [-150, 15, 54, 81, 0]
      );

      expect(await this.collectible.isForSale(0)).to.be.false;
      expect(await this.collectible.ownerOf(0)).to.equal(addr3.address);

      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      await this.market.connect(addr3).putTokenForSale(0, {
        isAuction: true,
        reservePrice: 200,
        auctionStartTime: timestampBefore + oneDay,
        auctionEndTime: timestampBefore + twoDays,
      });
      expect(await this.collectible.isForSale(0)).to.be.true;

      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");

      await this.stableToken
        .connect(addr4)
        .increaseAllowance(this.market.address, 250);
      await expect(() =>
        this.market.connect(addr4).createBid(0, 250)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, addr4],
        [250, -250]
      );

      await ethers.provider.send("evm_increaseTime", [twoDays]);
      await ethers.provider.send("evm_mine");

      await expect(() =>
        this.market.connect(addr3).endAuction(0)
      ).to.changeTokenBalances(
        this.stableToken,
        [this.market, owner, addr1, addr2, addr3, addr4],
        [-250, 25, 20, 30, 175, 0]
      );

      expect(await this.collectible.isForSale(0)).to.be.false;
      expect(await this.collectible.ownerOf(0)).to.equal(addr4.address);
    });

    it("validate that the token is removed from sale after the auction with no bidders", async function () {
      const [owner, addr1] = await ethers.getSigners();

      const twoDays = 2 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [twoDays]);
      await ethers.provider.send("evm_mine");

      await expect(this.market.endAuction(0))
        .to.emit(this.market, "LogAuctionEnded")
        .withArgs(
          this.market.address,
          0,
          addr1.address,
          "0x0000000000000000000000000000000000000000",
          0
        );

      expect(await this.collectible.isForSale(0)).to.be.false;
      expect(await this.collectible.ownerOf(0)).to.equal(addr1.address);
    });
  });
});
