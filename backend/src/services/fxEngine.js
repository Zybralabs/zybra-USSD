
const axios = require('axios');
async function convertMWKtoUSDC(mwkAmount) {
  const mwkToUsdRate = 1733.36; // Simulated Chainlink value
  return parseFloat((mwkAmount / mwkToUsdRate).toFixed(2));
}
module.exports = { convertMWKtoUSDC };
