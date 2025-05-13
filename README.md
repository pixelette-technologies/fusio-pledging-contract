# Fusio Smart Contracts – Pledging & Rewards

This project serves as a foundational setup for fusio smart contract handling fusio token pledging, tiered rewards distribution, and monthly reward claiming


## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Usage](#usage)
  - [Compile Contracts](#compile-contracts)
  - [Run Tests](#run-tests)
  - [Deploy Contracts](#deploy-contracts)
  - [Interact with Contracts](#interact-with-contracts)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [License](#license)

## Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/en/) (v14 or later)
- [npm](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)
- [Git](https://git-scm.com/)

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/pixelette-technologies/fusio-pledging-contract.git
   cd your-repo-name
   ```

2. **Install dependencies:**

   Using npm:

   ```bash
   npm install
   ```

   Or using Yarn:

   ```bash
   yarn install
   ```

## Project Structure

```
.
├── contracts/          # Solidity smart contracts
├── scripts/            # Deployment and interaction scripts
├── test/               # Test files
├── docs/               # Documentation for FusioPledge contract
├── .env.example        # Example environment variables
├── hardhat.config.js   # Hardhat configuration
├── package.json        # Project metadata and dependencies
└── README.md           # Project documentation
```

## Usage

### Compile Contracts

Compile the smart contracts using Hardhat:

```bash
npx hardhat compile
```

### Run Tests

Execute the test suite:

```bash
npx hardhat test
```

### Deploy Contracts

Deploy contracts to a specified network:

```bash
npx hardhat run scripts/deployFusioPledge.js --network <network-name>
```

Replace `<network-name>` with your target network (e.g., `localhost`, `bsctestenet`, `bsc`).

## Configuration

Configure networks and other settings in `hardhat.config.js`. For example:

```javascript
require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

module.exports = {
  solidity: "0.8.28",
  networks: {
    bsct: {
      url: process.env.BSC_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};

## Environment Variables

Create a `.env` file in the root directory to manage sensitive information:

```env
RINKEBY_RPC_URL=https://rinkeby.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=your-private-key
```

Refer to `.env.example` for guidance.

## License

This project is licensed under the MIT License.
