// test/MockStableToken.test.js
const { expect } = require("chai");

describe("MockStableToken", () => {
  before(async function () {
    this.StableToken = await ethers.getContractFactory("MockStableToken");
  });

  beforeEach(async function () {
    this.stableToken = await this.StableToken.deploy();
  });

  it("assign initial supply to owner", async function () {
    const [owner] = await ethers.getSigners();
    const ownerBalance = await this.stableToken.balanceOf(owner.address);
    expect(await this.stableToken.totalSupply()).to.equal(ownerBalance);
  });

  it("allow transfer between accounts", async function () {
    const [owner, addr1, addr2] = await ethers.getSigners();

    await this.stableToken.transfer(addr1.address, 50);
    expect(await this.stableToken.balanceOf(addr1.address)).to.equal(50);

    await this.stableToken.connect(addr1).transfer(addr2.address, 50);
    expect(await this.stableToken.balanceOf(addr2.address)).to.equal(50);
    expect(await this.stableToken.balanceOf(addr1.address)).to.equal(0);
  });

  it("revert on insufficient funds", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await expect(
      this.stableToken.connect(addr1).transfer(owner.address, 50)
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });
});
