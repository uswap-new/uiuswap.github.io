/**
 * Market Module
 * Handles market price fetching and liquidity pool information with retry logic
 */

const MarketManager = (function() {
    let prices = {
        hive: 0,
        hbd: 0,
        vault: 0,
        upme: 0
    };

    let liquidity = {
        hive: 0,
        swapHive: 0
    };
    
    // Price cache
    let priceCache = {
        lastFetch: null,
        cacheDuration: 15000 // 15 seconds
    };

    /**
     * Query Hive Engine with Promise wrapper
     */
    function queryHiveEngine(contract, table, query, limit = 1) {
        return new Promise((resolve, reject) => {
            const ssc = APIManager.getSSC();
            if (!ssc) {
                reject(new Utils.APIError('Hive Engine API not initialized'));
                return;
            }

            ssc.find(contract, table, query, limit, 0, [], (err, result) => {
                if (err) reject(new Utils.APIError(err.message || 'Query failed'));
                else resolve(result || []);
            });
        });
    }

    /**
     * Fetch from CoinGecko with timeout
     */
    async function fetchCoinGecko(url) {
        try {
            const response = await Utils.withTimeout(
                axios.get(url),
                5000 // 5 second timeout
            );
            return response.data;
        } catch (error) {
            throw new Utils.APIError(`Failed to fetch from CoinGecko: ${error.message}`, url);
        }
    }

    /**
     * Fetch HIVE price from CoinGecko
     */
    async function fetchHivePrice() {
        try {
            const data = await Utils.retry(() => 
                fetchCoinGecko(CONFIG.COINGECKO_HIVE_URL),
                2, 1000
            );
            
            if (data && data.hive && data.hive.usd) {
                prices.hive = Utils.roundTo(data.hive.usd, 4);
                UIManager.updatePrice("hiveusdprice", prices.hive);
                return prices.hive;
            }
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchHivePrice');
            console.error(handled.message);
        }
        return 0;
    }

    /**
     * Fetch HBD price from CoinGecko
     */
    async function fetchHBDPrice() {
        try {
            const data = await Utils.retry(() =>
                fetchCoinGecko(CONFIG.COINGECKO_HBD_URL),
                2, 1000
            );
            
            if (data && data.hive_dollar && data.hive_dollar.usd) {
                prices.hbd = Utils.roundTo(data.hive_dollar.usd, 4);
                UIManager.updatePrice("hbdusdprice", prices.hbd);
                return prices.hbd;
            }
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchHBDPrice');
            console.error(handled.message);
        }
        return 0;
    }

    /**
     * Fetch token price from Hive Engine
     */
    async function fetchTokenPrice(symbol) {
        try {
            const metrics = await Utils.retry(() =>
                queryHiveEngine('market', 'metrics', { symbol }),
                2, 1000
            );

            if (metrics && metrics.length > 0) {
                const lastPrice = Utils.parseNumber(metrics[0].lastPrice, 0);
                const hivePrice = prices.hive || 0;
                const usdPrice = Utils.safeMultiply(lastPrice, hivePrice);
                return Utils.roundTo(usdPrice, 6);
            }
        } catch (error) {
            const handled = Utils.handleError(error, `MarketManager.fetchTokenPrice(${symbol})`);
            console.error(handled.message);
        }
        return 0;
    }

    /**
     * Fetch VAULT price
     */
    async function fetchVaultPrice() {
        const price = await fetchTokenPrice('VAULT');
        prices.vault = price;
        UIManager.updatePrice("vaultusdprice", price);
        return price;
    }

    /**
     * Fetch UPME price
     */
    async function fetchUpmePrice() {
        const price = await fetchTokenPrice('UPME');
        prices.upme = price;
        UIManager.updatePrice("upmeusdprice", price);
        return price;
    }

    /**
     * Fetch all market prices (with caching)
     */
    async function fetchAllPrices(forceRefresh = false) {
        const now = Date.now();
        
        // Check cache
        if (!forceRefresh && priceCache.lastFetch && 
            (now - priceCache.lastFetch) < priceCache.cacheDuration) {
            console.log('Using cached market prices');
            return prices;
        }
        
        try {
            // Fetch in parallel for better performance
            await Promise.all([
                fetchHivePrice(),
                fetchHBDPrice()
            ]);
            
            // Fetch token prices (depend on HIVE price)
            await Promise.all([
                fetchVaultPrice(),
                fetchUpmePrice()
            ]);
            
            priceCache.lastFetch = now;
            console.log("Market prices updated:", prices);
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchAllPrices');
            console.error(handled.message);
        }
        
        return prices;
    }

    /**
     * Fetch liquidity pool balances
     */
    async function fetchLiquidity() {
        try {
            // Fetch both in parallel
            const [accounts, tokens] = await Promise.all([
                Utils.retry(() => 
                    hive.api.getAccountsAsync([CONFIG.BRIDGE_USER]),
                    2, 1000
                ),
                Utils.retry(() =>
                    queryHiveEngine('tokens', 'balances', { 
                        account: CONFIG.BRIDGE_USER, 
                        symbol: 'SWAP.HIVE' 
                    }),
                    2, 1000
                )
            ]);

            // Update HIVE liquidity
            if (accounts && accounts.length > 0) {
                liquidity.hive = Utils.parseNumber(accounts[0].balance, 0);
                CONFIG.HIVEPOOL = liquidity.hive;  // Update pool for fee calculation
                UIManager.updateLiquidity("hiveliquidity", liquidity.hive);
            }

            // Update SWAP.HIVE liquidity
            if (tokens && tokens.length > 0) {
                liquidity.swapHive = Utils.parseNumber(tokens[0].balance, 0);
                CONFIG.SHIVEPOOL = liquidity.swapHive;  // Update pool for fee calculation
                UIManager.updateLiquidity("swaphiveliquidity", liquidity.swapHive);
            }

            console.log("Liquidity updated:", liquidity);
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchLiquidity');
            console.error(handled.message);
        }
    }

    /**
     * Get current prices
     */
    function getPrices() {
        return Utils.deepClone(prices);
    }

    /**
     * Get current liquidity
     */
    function getLiquidity() {
        return Utils.deepClone(liquidity);
    }

    /**
     * Initialize market module
     */
    async function initialize() {
        await fetchAllPrices();
        await fetchLiquidity();
        console.log("Market Manager initialized");
    }

    // Public API
    return {
        initialize,
        fetchAllPrices,
        fetchLiquidity,
        getPrices,
        getLiquidity,
        fetchHivePrice,
        fetchHBDPrice,
        fetchVaultPrice,
        fetchUpmePrice
    };
})();
