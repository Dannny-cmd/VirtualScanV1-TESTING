const apiUrlPrototype = 'https://api.virtuals.io/api/virtuals?filters[status]=1&sort[0]=createdAt%3Adesc&sort[1]=createdAt%3Adesc&populate[0]=image&pagination[page]=1&pagination[pageSize]=100';
const apiUrlSentient = 'https://api.virtuals.io/api/virtuals?filters[status]=2&sort[0]=createdAt%3Adesc&sort[1]=createdAt%3Adesc&populate[0]=image&pagination[page]=1&pagination[pageSize]=100';
const coinLoreUrl = 'https://api.coinlore.net/api/ticker/?id=127083';
let allItems = [];
let uniqueChains = new Set();
let priceUsd = 0;

async function fetchPrice() {
  try {
    const response = await fetch(coinLoreUrl);
    const data = await response.json();
    priceUsd = parseFloat(data[0].price_usd);
  } catch (error) {
    console.error('Error fetching price:', error);
  }
}

async function fetchMostRecentTrade(tokenAddress, chainID) {
  try {
    const response = await fetch(`https://vp-api.virtuals.io/vp-api/trades?tokenAddress=${tokenAddress}&limit=1&chainID=${chainID}`);
    const data = await response.json();
    
    if (data.code === 0 && data.data.Trades.length > 0) {
      const trade = data.data.Trades[0];
      const isBuy = trade.isBuy ? 'Buy' : 'Sell';
      const virtualTokenAmt = parseFloat(trade.virtualTokenAmt);
      const agentTokenAmt = parseFloat(trade.agentTokenAmt);
      const price = await fetchVirtualTokenPrice();
      const dollarAmount = (virtualTokenAmt * price).toFixed(2);
      const formattedAgentTokenAmt = formatAmount(agentTokenAmt);
      const timestamp = new Date(trade.timestamp * 1000);
      const timeAgo = formatTimeAgo(timestamp);
      
      // Removed percentage from the return statement
      return `Most recent trade: ${timeAgo} - ${isBuy} - ${formattedAgentTokenAmt} tokens - $${dollarAmount}`;
    }
  } catch (error) {
    console.error('Error fetching most recent trade:', error);
  }
  return '';
}

async function fetchVirtualTokenPrice() {
  try {
    const response = await fetch(coinLoreUrl);
    const data = await response.json();
    return parseFloat(data[0].price_usd);
  } catch (error) {
    console.error('Error fetching virtual token price:', error);
    return 0;
  }
}

function formatTimeAgo(date) {
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  let interval = Math.floor(seconds / 31536000);
  
  if (interval >= 1) {
    return interval === 1 ? "1 year ago" : interval + " years ago";
  }
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) {
    return interval === 1 ? "1 month ago" : interval + " months ago";
  }
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) {
    return interval === 1 ? "1 day ago" : interval + " days ago";
  }
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) {
    return interval === 1 ? "1 hour ago" : interval + " hours ago";
  }
  interval = Math.floor(seconds / 60);
  if (interval >= 1) {
    return interval === 1 ? "1 minute ago" : interval + " minutes ago";
  }
  return seconds === 1 ? "1 second ago" : seconds + " seconds ago";
}

async function fetchHolders(preToken) {
  try {
    const response = await fetch(`https://api.virtuals.io/api/tokens/${preToken}/holders`);
    const data = await response.json();
    
    const lockedAddress = "0xdAd686299FB562f89e55DA05F1D96FaBEb2A2E32";
    let lockedAmount = 0;

    data.data.forEach(holder => {
      if (holder[0].toLowerCase() === lockedAddress.toLowerCase()) {
        lockedAmount = holder[1];
      }
    });

    const lockedPercentage = (lockedAmount / 1_000_000_000) * 100;

    return {
      holders: data.data.slice(0, 10),
      lockedPercentage: lockedPercentage.toFixed(1),
      topHoldersPercentage: (data.data.slice(0, 10).reduce((total, holder) => total + holder[1], 0) / 1_000_000_000 * 100).toFixed(1)
    };
  } catch (error) {
    console.error('Error fetching holders:', error);
    return { holders: [], lockedPercentage: 0, topHoldersPercentage: 0 };
  }
}

async function fetchAllHolders(tokens) {
  const holderPromises = tokens.map(token => {
    const tokenToUse = token.tokenAddress || token.preToken;
    return fetchHolders(tokenToUse);
  });
  return Promise.all(holderPromises);
}

async function fetchData(searchTerm = '') {
  showLoadingScreen();
  await fetchPrice();
  let url;

  if (searchTerm) {
    document.querySelectorAll('input[name="type"]').forEach(input => {
      input.disabled = true;
      input.parentElement.style.color = 'grey';
    });

    url = `https://api.virtuals.io/api/virtuals?filters[status]=3&filters[$or][0][name][$contains]=${searchTerm}&filters[$or][1][symbol][$contains]=${searchTerm}&filters&sort[0]=createdAt%3Adesc&populate[0]=image&pagination[page]=1&pagination[pageSize]=100`;
  } else {
    const selectedType = document.querySelector('input[name="type"]:checked').value;
    url = selectedType === 'sentient' ? apiUrlSentient : apiUrlPrototype;
    enableRadioButtons();
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.filters && data.filters[0].status === 2) {
      allItems = data.data.map(item => ({
        ...item,
        tokenAddress: item.tokenAddress !== null ? item.tokenAddress : item.preToken,
        volume: {
          h1: item.volume.h1,
          h6: item.volume.h6,
          h24: item.volume.h24
        },
        priceChange: {
          h1: item.priceChange.h1,
          h6: item.priceChange.h6,
          h24: item.priceChange.h24
        }
      }));
    } else {
      allItems = data.data.map(item => ({
        ...item,
        tokenAddress: item.tokenAddress !== null ? item.tokenAddress : item.preToken,
        volume: item.volume || {},
        priceChange: item.priceChange || {}
      }));
      
      const holdersData = await fetchAllHolders(allItems);
      
      allItems = allItems.map((item, index) => ({
        ...item,
        topHolders: holdersData[index].holders || [],
        lockedPercentage: holdersData[index].lockedPercentage,
        topHoldersPercentage: holdersData[index].topHoldersPercentage
      }));

      if (url === apiUrlPrototype) {
        await Promise.all(allItems.map(async (item) => {
          const chainID = item.chain === 'SOLANA' ? 1 : 0;
          const preToken = item.preToken;

          const mostRecentTrade = await fetchMostRecentTrade(preToken, chainID);
          item.mostRecentTrade = mostRecentTrade;

          const oneHourResponse = await fetch(`https://vp-api.virtuals.io/vp-api/tickers?tokenAddress=${preToken}&granularity=3600&chainID=${chainID}`);
          const oneHourData = await oneHourResponse.json();
          item.volume.h1 = oneHourData.data.Ticker.volume;
          item.priceChange.h1 = isNaN(parseFloat(oneHourData.data.Ticker.priceChangePercent)) ? '0.00' : parseFloat(oneHourData.data.Ticker.priceChangePercent).toFixed(2);

          const sixHourResponse = await fetch(`https://vp-api.virtuals.io/vp-api/tickers?tokenAddress=${preToken}&granularity=21600&chainID=${chainID}`);
          const sixHourData = await sixHourResponse.json();
          item.volume.h6 = sixHourData.data.Ticker.volume;
          item.priceChange.h6 = isNaN(parseFloat(sixHourData.data.Ticker.priceChangePercent)) ? '0.00' : parseFloat(sixHourData.data.Ticker.priceChangePercent).toFixed(2);

          const twentyFourHourResponse = await fetch(`https://vp-api.virtuals.io/vp-api/tickers?tokenAddress=${preToken}&granularity=86400&chainID=${chainID}`);
          const twentyFourHourData = await twentyFourHourResponse.json();
          item.volume.h24 = twentyFourHourData.data.Ticker.volume;
          item.priceChange.h24 = isNaN(parseFloat(twentyFourHourData.data.Ticker.priceChangePercent)) ? '0.00' : parseFloat(twentyFourHourData.data.Ticker.priceChangePercent).toFixed(2);
        }));
      }
    }

    displayData(allItems);
    populateChainFilter(allItems);
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    hideLoadingScreen();
  }
}

function debounce(func, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function showLoadingScreen() {
  document.getElementById('loading-screen').style.display = 'flex';
}

function hideLoadingScreen() {
  document.getElementById('loading-screen').style.display = 'none';
}

function formatMarketCap(value) {
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  } else if (value >= 1e3) {
    return `$${(value / 1e3).toFixed(1)}k`;
  }
  return `$${value.toFixed(2)}`;
}

function formatAmount(value) {
  let formattedValue;
  let percentage = ((value / 1_000_000_000) * 100).toFixed(2);

  if (value < 10000) {
    formattedValue = value.toFixed(9);
  } else if (value >= 1e6) {
    formattedValue = `${(value / 1e6).toFixed(2)}m`;
  } else if (value >= 1e3) {
    formattedValue = `${(value / 1e3).toFixed(2)}k`;
  } else {
    formattedValue = `${value.toFixed(1)}`;
  }

  return `${formattedValue}`; // Removed percentage from the return statement
}

function formatVolume(value) {
  if (value < 1000) {
    return `$${Math.round(value)}`;
  } else {
    return `$${(value / 1e3).toFixed(1)}k`;
  }
}

function timeAgo(dateString) {
  const now = new Date();
  const createdAt = new Date(dateString);
  const seconds = Math.floor((now - createdAt) / 1000);
  let interval = Math.floor(seconds / 31536000);

  if (interval >= 1) {
    return interval === 1 ? "1 year ago" : interval + " years ago";
  }
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) {
    return interval === 1 ? "1 month ago" : interval + " months ago";
  }
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) {
    return interval === 1 ? "1 day ago" : interval + " days ago";
  }
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) {
    return interval === 1 ? "1 hour ago" : interval + " hours ago";
  }
  interval = Math.floor(seconds / 60);
  if (interval >= 1) {
    return interval === 1 ? "1 minute ago" : interval + " minutes ago";
  }
  return seconds === 1 ? "1 second ago" : seconds + " seconds ago";
}

function formatAddress(address) {
  if (!address || typeof address !== 'string') return '';
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function generateUserLinks(links) {
  if (!links || typeof links !== 'object') {
    return '';
  }
  
  let userLinksHtml = '';
  for (const [key, value] of Object.entries(links)) {
    if (value) {
      userLinksHtml += `<a href="${value}" target="_blank">${key}</a>`;
    }
  }
  return userLinksHtml;
}

function sortData(items) {
  const sortOption = document.querySelector('input[name="sort"]:checked').value;
  if (sortOption === 'marketCap') {
    return items.sort((a, b) => parseFloat(b.mcapInVirtual) - parseFloat(a.mcapInVirtual));
  } else if (sortOption === 'lockedPercentage') {
    return items.sort((a, b) => parseFloat(b.lockedPercentage) - parseFloat(a.lockedPercentage));
  } else if (sortOption === 'topHoldersPercentage') {
    return items.sort((a, b) => parseFloat(a.topHoldersPercentage) - parseFloat(b.topHoldersPercentage));
  }
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function displayData(items) {
  const container = document.getElementById('data-container');
  container.innerHTML = '';

  const selectedChain = document.getElementById('chain-filter').value;

  const filteredItems = allItems.filter(item => {
    const matchesChain = selectedChain ? item.chain === selectedChain : true;
    const hasTopHoldersPercentage = parseFloat(item.topHoldersPercentage) > 0.0;
    return matchesChain && hasTopHoldersPercentage;
  });

  const sortedItems = sortData(filteredItems);
  sortedItems.forEach(item => {
    const mcapInVirtual = parseFloat(item.mcapInVirtual);
    const marketCap = formatMarketCap(mcapInVirtual * priceUsd);

    const totalTopHolders = item.topHolders.reduce((total, holder) => total + holder[1], 0);
    const topHoldersPercentage = ((totalTopHolders / 1_000_000_000) * 100).toFixed(1);

    const chainImage = item.chain === 'SOLANA' 
      ? '<img src="https://app.virtuals.io/static/media/sol.79b9cfe7b0c13f7be8eea8a23e433093.svg" alt="Solana" style="width: 20px; height: 20px; margin-left: 5px;">' 
      : item.chain === 'BASE' 
      ? '<img src="https://app.virtuals.io/static/media/base.7c8cb7be5ba0a56671991170cb3e8aa4.svg" alt="Base" style="width: 20px; height: 20px; margin-left: 5px;">' 
      : '';

    const itemDiv = document.createElement('div');
    itemDiv.className = 'item';
    itemDiv.innerHTML = `
      <div class="item-header">
        <img src="${item.image.url}" alt="${item.name}">
        <h2>${item.name} <span class="symbol">($${item.symbol})</span>
          ${chainImage}
          <img src="https://i.postimg.cc/rFS4tjSq/padlock-clipart-lock-icon-15.png" alt="Locked" title="Locked" class="lock-icon" style="width: 20px; height: 20px; vertical-align: middle; margin-left: 5px;">
          <span class="locked-percentage">${item.lockedPercentage}%</span>
        </h2>
      </div>
      <div class="item-details">
        <p>
          <img src="https://i.postimg.cc/GpCVcvh6/icon-design-black-and-white-timer-symbol-alarm-clocks-removebg-preview.png" 
               alt="Created At" title="Created At" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;">
          ${timeAgo(item.createdAt)}
        </p>
        <div class="copyable-text" onclick="copyToClipboard('${item.tokenAddress || item.preToken}')"><strong>CA:</strong> ${formatAddress(item.tokenAddress || item.preToken)}</div>
        <div class="copyable-text" onclick="copyToClipboard('${item.walletAddress}')"><strong>Dev Wallet:</strong> ${formatAddress(item.walletAddress)}</div>
        <p><strong>Holders:</strong> ${item.holderCount || 0}</p>
        <p><strong>Market Cap:</strong> ${marketCap}</p>
        
        <p><strong>Vol:</strong> 
          1H: ${formatVolume(item.volume.h1 || 0)} | 
          6H: ${formatVolume(item.volume.h6 || 0)} | 
          24H: ${formatVolume(item.volume.h24 || 0)}</p>
        
        <p><strong>Change:</strong> 
          1H: <span class="${item.priceChange.h1 > 0 ? 'price-change-up' : item.priceChange.h1 < 0 ? 'price-change-down' : ''}">${item.priceChange.h1 !== undefined ? item.priceChange.h1 + '%' : '0%'}</span> | 
          6H: <span class="${item.priceChange.h6 > 0 ? 'price-change-up' : item.priceChange.h6 < 0 ? 'price-change-down' : ''}">${item.priceChange.h6 !== undefined ? item.priceChange.h6 + '%' : '0%'}</span> | 
          24H: <span class="${item.priceChange.h24 > 0 ? 'price-change-up' : item.priceChange.h24 < 0 ? 'price-change-down' : ''}">${item.priceChange.h24 !== undefined ? item.priceChange.h24 + '%' : '0%'}</span></p>
        
        ${item.mostRecentTrade ? `<p><strong>Most recent trade:</strong> ${item.mostRecentTrade.replace('Most recent trade:', '')}</p>` : ''}
        
        <p><strong>Top 10 Holder %:</strong> ${topHoldersPercentage}% 
          <button onclick="showTopHolders('${item.preToken}')" style="background: none; border: none; cursor: pointer;">
            <img src="https://i.postimg.cc/s2zTj2XX/magnify.png" alt="View Top Holders" style="width: 20px; height: 20px; vertical-align: middle;">
          </button>
        </p>
        <div class="user-links">
          ${generateUserLinks(item.socials && typeof item.socials === 'object' ? item.socials.USER_LINKS : {})}
        </div>
        <div class="trade-links">
          <a href="https://app.virtuals.io/prototypes/${item.preToken}" target="_blank" class="trade-link">Trade on Virtuals</a>
          <a href="${item.chain === 'SOLANA' ? `https://solscan.io/token/${item.tokenAddress}` : `https://basescan.org/address/${item.tokenAddress}`}" target="_blank" class="trade-link">${item.chain === 'SOLANA' ? 'Solscan' : 'Basescan'}</a>
        </div>
      </div>
    `;
    container.appendChild(itemDiv);
  });
}

function populateChainFilter(items) {
  const chainFilter = document.getElementById('chain-filter');
  uniqueChains.clear();
  items.forEach(item => {
    uniqueChains.add(item.chain);
  });
  chainFilter.innerHTML = '<option value="">All Chains</option>';
  uniqueChains.forEach(chain => {
    const option = document.createElement('option');
    option.value = chain;
    option.textContent = chain;
    chainFilter.appendChild(option);
  });
}

function filterData() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const selectedChain = document.getElementById('chain-filter').value;
  const filteredItems = allItems.filter(item => {
    const matchesChain = selectedChain ? item.chain === selectedChain : true;
    const hasTopHoldersPercentage = parseFloat(item.topHoldersPercentage) > 0.0;
    return matchesChain && hasTopHoldersPercentage;
  });
  displayData(filteredItems);
}

function showTopHolders(preToken) {
  const item = allItems.find(item => item.preToken === preToken);
  if (!item) {
    console.error('Token not found:', preToken);
    return;
  }
  
  const holders = item.topHolders;
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = holders.map(holder => {
    const formattedAmount = formatAmount(holder[1]);
    return `<p>${holder[0]}: ${formattedAmount}</p>`;
  }).join('');
  openModal();
}

function openModal() {
  document.getElementById('modal').style.display = 'block';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

function copyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    showCopyNotification('Copied to clipboard: ' + text);
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }
  document.body.removeChild(textArea);
}

function showCopyNotification(message) {
  const popup = document.createElement('div');
  popup.className = 'copy-popup';
  popup.innerText = message;
  document.body.appendChild(popup);
  setTimeout(() => {
    document.body.removeChild(popup);
  }, 2000);
}

// Add event listener for chain filter
document.getElementById('chain-filter').addEventListener('change', filterData);

// Add event listener for radio buttons
document.querySelectorAll('input[name="type"]').forEach(input => {
  input.addEventListener('change', () => {
    const searchTerm = document.getElementById('search-input').value.trim();
    fetchData(searchTerm);
  });
});

// Add event listener for sorting buttons
document.querySelectorAll('input[name="sort"]').forEach(input => {
  input.addEventListener('change', () => {
    filterData();
  });
});

// Add event listener for search input with debounce
const debouncedFetchData = debounce((searchTerm) => fetchData(searchTerm), 500);
document.getElementById('search-input').addEventListener('input', (event) => {
  const searchTerm = event.target.value.trim();
  document.getElementById('clear-search').style.display = searchTerm ? 'block' : 'none';
  debouncedFetchData(searchTerm);
});

// Clear search input
document.getElementById('clear-search').addEventListener('click', () => {
  const searchInput = document.getElementById('search-input');
  searchInput.value = '';
  document.getElementById('clear-search').style.display = 'none';
  fetchData();
});

// Add event listener for refresh button
document.querySelector('.refresh-button').addEventListener('click', () => {
  const searchInput = document.getElementById('search-input');
  searchInput.value = '';
  document.getElementById('clear-search').style.display = 'none';
  fetchData();
});

// Enable radio buttons function
function enableRadioButtons() {
  document.querySelectorAll('input[name="type"]').forEach(input => {
    input.disabled = false;
    input.parentElement.style.color = '';
  });
}

// Initial data fetch
fetchData();
