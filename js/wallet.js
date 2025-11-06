/**
 * Wallet Module
 * Handles wallet balance loading and management with improved error handling
 */

const WalletManager = (function() {
    let currentUser = null;
    let balances = {
        HIVE: 0,
        "SWAP.HIVE": 0
    };
    
    // Cache for balance refresh
    let lastFetch = null;
    const CACHE_DURATION = 10000; // 10 seconds

    /**
     * Query Hive Engine with Promise wrapper
     */
    function queryHiveEngine(contract, table, query, limit = 1000) {
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
     * Fetch HIVE balance with retry
     */
    async function fetchHiveBalance(username) {
        const accounts = await Utils.retry(() => 
            hive.api.getAccountsAsync([username]),
            3, 1000
        );

        if (!accounts || accounts.length === 0) {
            throw new Utils.ValidationError('Account not found');
        }

        const hiveBalance = Utils.parseNumber(accounts[0].balance, 0);
        return Utils.floorTo(hiveBalance, 3);
    }

    /**
     * Fetch SWAP.HIVE balance with retry
     */
    async function fetchSwapHiveBalance(username) {
        const tokens = await Utils.retry(() =>
            queryHiveEngine('tokens', 'balances', { 
                account: username, 
                symbol: 'SWAP.HIVE' 
            }),
            3, 1000
        );

        const swapHiveBalance = tokens && tokens.length > 0 
            ? Utils.parseNumber(tokens[0].balance, 0)
            : 0;

        return Utils.floorTo(swapHiveBalance, 3);
    }

    /**
     * Load user balances from Hive and Hive Engine
     */
    async function loadBalance(username) {
        // Validate username
        const sanitized = Utils.sanitizeUsername(username);
        if (!Utils.isValidUsername(sanitized)) {
            UIManager.showError("Invalid username format");
            return null;
        }

        // Check cache
        const now = Date.now();
        if (currentUser === sanitized && lastFetch && (now - lastFetch) < CACHE_DURATION) {
            return balances;
        }

        try {
            UIManager.showLoading("Loading balances...");
            
            // Fetch both balances in parallel
            const [hiveBalance, swapHiveBalance] = await Promise.all([
                fetchHiveBalance(sanitized),
                fetchSwapHiveBalance(sanitized)
            ]);

            // Update state
            balances.HIVE = hiveBalance;
            balances["SWAP.HIVE"] = swapHiveBalance;
            currentUser = sanitized;
            lastFetch = now;

            // Update UI
            UIManager.updateBalance("hive", hiveBalance);
            UIManager.updateBalance("swaphive", swapHiveBalance);
            UIManager.hideLoading();
            
            // Trigger swap validation to enable/disable button based on current state
            SwapManager.validateButton();
            
            // Update swap history
            UIManager.updateSwapHistory();

            return balances;

        } catch (error) {
            const handled = Utils.handleError(error, 'WalletManager.loadBalance');
            UIManager.hideLoading();
            UIManager.showError(handled.message);
            return null;
        }
    }

    /**
     * Get current user
     */
    function getCurrentUser() {
        return currentUser;
    }

    /**
     * Get current balances
     */
    function getBalances() {
        return Utils.deepClone(balances);
    }

    /**
     * Get specific balance
     */
    function getBalance(symbol) {
        return balances[symbol] || 0;
    }

    /**
     * Update balance after swap
     */
    function updateBalance(symbol, amount) {
        if (balances.hasOwnProperty(symbol)) {
            const newAmount = Utils.floorTo(amount, 3);
            balances[symbol] = newAmount;
            const id = symbol === "HIVE" ? "hive" : "swaphive";
            UIManager.updateBalance(id, newAmount);
        }
    }
    
    /**
     * Refresh balance (force reload)
     */
    async function refreshBalance() {
        if (!currentUser) {
            UIManager.showError("No user loaded");
            return null;
        }
        lastFetch = null; // Clear cache
        return await loadBalance(currentUser);
    }
    
    /**
     * Clear current user and balances
     */
    function clearWallet() {
        currentUser = null;
        balances = { HIVE: 0, "SWAP.HIVE": 0 };
        lastFetch = null;
    }

    // Public API
    return {
        loadBalance,
        getCurrentUser,
        getBalances,
        getBalance,
        updateBalance,
        refreshBalance,
        clearWallet
    };
})();
