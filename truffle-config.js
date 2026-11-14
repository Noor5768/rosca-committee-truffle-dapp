// Truffle configuration: connects to the local Ganache blockchain.
module.exports = {
  networks: {
    development: {
      host: "127.0.0.1", // Ganache runs on this computer
      port: 7545,        // Ganache's default RPC port (check the RPC SERVER box in Ganache)
      network_id: "*",   // match any network id
    },
  },

  compilers: {
    solc: {
      version: "0.8.20", // matches `pragma solidity ^0.8.20;`
      settings: {
        optimizer: { enabled: false, runs: 200 },
        evmVersion: "paris", // keeps the bytecode compatible with Ganache
      },
    },
  },
};
