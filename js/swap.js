/**
 * Swap Module
 * Handles swap calculations, fee calculations, and swap execution with improved accuracy
 */

const SwapManager = (function() {
    let feeConfig = {
        BASE_FEE: CONFIG.BASE_FEE,
        MIN_BASE_FEE: CONFIG.MIN_BASE_FEE,
        DIFF_COEFFICIENT: CONFIG.DIFF_COEFFICIENT,
        BASE_PRICE_HIVE_TO_SHIVE: CONFIG.BASE_PRICE_HIVE_TO_SHIVE
    };

    let currentSwap = {
        from: "HIVE",
        to: "SWAP.HIVE",
        amount: 0,
        expected: 0,
        fee: 0,
        feePercent: 0,
        slippage: 0.01,
        minReceive: 0
    };

    /**
     * Check uswap HIVE transfers for completion confirmation
     */
    async function checkUswapHiveTransfers(originalTxId, username) {
        try {
            const history = await hive.api.getAccountHistoryAsync(CONFIG.BRIDGE_USER, -1, 100);
                        
            // Filter for direct transfers to our user
            // Structure: [index, {trx_id, block, op: [type, data], timestamp, ...}]
            const transfersToUser = history.filter((item) => {
                const op = item[1]?.op;
                return op && op[0] === 'transfer' && op[1].from === CONFIG.BRIDGE_USER && op[1].to === username;
            });
            
            for (let i = transfersToUser.length - 1; i >= 0; i--) {
                const item = transfersToUser[i];
                const op = item[1].op;
                const transferData = op[1];
                const memo = transferData.memo || '';
                const trxId = item[1].trx_id;
                
                if (memo.includes(originalTxId)) {
                    // Parse memo to extract swap details
                    const qtyMatch = memo.match(/Swapped Qty\s*:\s*([\d.]+)/);
                    const priceMatch = memo.match(/Swapped Price\s*:\s*([\d.]+)/);
                    
                    return {
                        found: true,
                        amount: transferData.amount,
                        txId: trxId,
                        swappedQty: qtyMatch ? qtyMatch[1] : null,
                        swappedPrice: priceMatch ? priceMatch[1] : null,
                        memo: memo
                    };
                }
            }
            
            return { found: false };
        } catch (error) {
            console.error('Error checking HIVE transfers:', error);
            return { found: false };
        }
    }

    /**
     * Check uswap SWAP.HIVE transfers for completion confirmation
     */
    async function checkUswapEngineTransfers(originalTxId, username) {
        try {
            const history = await hive.api.getAccountHistoryAsync(CONFIG.BRIDGE_USER, -1, 100);
            
            // Filter for custom_json operations
            // Structure: [index, {trx_id, block, op: [type, data], timestamp, ...}]
            const customJsonOps = history.filter((item) => {
                const op = item[1]?.op;
                return op && op[0] === 'custom_json' && op[1].id === 'ssc-mainnet-hive';
            });
            
            for (let i = customJsonOps.length - 1; i >= 0; i--) {
                const item = customJsonOps[i];
                const op = item[1].op;
                const opData = op[1];
                const trxId = item[1].trx_id;
                
                try {
                    const json = JSON.parse(opData.json);
                    
                    // Check if it's a token transfer to our user
                    if (json.contractName === 'tokens' && 
                        json.contractAction === 'transfer' &&
                        json.contractPayload &&
                        json.contractPayload.to === username &&
                        json.contractPayload.symbol === 'SWAP.HIVE') {
                        
                        const payload = json.contractPayload;
                        const memo = payload.memo || '';
                        
                        if (memo.includes(originalTxId)) {
                            const qtyMatch = memo.match(/Swapped Qty\s*:\s*([\d.]+)/);
                            const priceMatch = memo.match(/Swapped Price\s*:\s*([\d.]+)/);
                            
                            return {
                                found: true,
                                amount: `${payload.quantity} SWAP.HIVE`,
                                txId: trxId,
                                swappedQty: qtyMatch ? qtyMatch[1] : null,
                                swappedPrice: priceMatch ? priceMatch[1] : null,
                                memo: memo
                            };
                        }
                    }
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    continue;
                }
            }
            
            return { found: false };
        } catch (error) {
            console.error('Error checking Engine transfers:', error);
            return { found: false };
        }
    }

    /**
     * Wait for swap completion and verify
     */
    async function waitForSwapCompletion(originalTxId, username, toToken) {
        UIManager.showLoading("Waiting for swap to complete (45s)...");
        
        // Wait 45 seconds
        await Utils.sleep(45000);
        
        UIManager.showLoading("Verifying swap completion...");
        
        // Check appropriate transfer history based on output token
        let result;
        if (toToken === "HIVE") {
            result = await checkUswapHiveTransfers(originalTxId, username);
        } else {
            result = await checkUswapEngineTransfers(originalTxId, username);
        }
        
        return result;
    }

    /**
     * Add swap to history tracking
     */
    function addSwapToHistory(txId, amount, fromToken, username) {
        const swapRecord = {
            timestamp: Date.now(),
            txIdSent: txId,
            amountSent: `${amount.toFixed(3)} ${fromToken}`,
            fromToken: fromToken,
            toToken: fromToken === "HIVE" ? "SWAP.HIVE" : "HIVE",
            username: username,
            status: 'pending',
            txIdReceived: null,
            amountReceived: null
        };

        // Get existing history from localStorage
        let history = JSON.parse(localStorage.getItem('swapHistory') || '[]');
        
        // Add new record at the beginning
        history.unshift(swapRecord);
        
        // Keep only last 10 swaps per user
        const userHistory = history.filter(h => h.username === username).slice(0, 10);
        const otherHistory = history.filter(h => h.username !== username);
        history = [...userHistory, ...otherHistory];
        
        // Save to localStorage
        localStorage.setItem('swapHistory', JSON.stringify(history));
        
        // Update UI
        UIManager.updateSwapHistory();
    }

    /**
     * Verify if transaction exists on blockchain by transaction ID
     */
    async function verifyTransactionExists(txId, fromToken) {
        try {
            if (fromToken === "HIVE") {
                // For HIVE transactions, verify on Hive blockchain
                try {
                    const tx = await hive.api.getTransactionAsync(txId);
                    return tx !== null && tx !== undefined;
                } catch (error) {
                    return false;
                }
            } else {
                // For SWAP.HIVE (custom_json), verify it was processed by Hive Engine side chain
                try {
                    const ssc = APIManager.getSSC();
                    if (!ssc) {
                        return false;
                    }
                    
                    const engineTx = await ssc.getTransactionInfo(txId);
                    // Hive Engine returns an object with blockNumber, transactionId, etc if found
                    // Returns null or undefined if not found
                    return engineTx !== null && engineTx !== undefined && engineTx.transactionId;
                } catch (error) {
                    return false;
                }
            }
        } catch (error) {
            console.error('Error verifying transaction existence:', error);
            return false;
        }
    }

    /**
     * Load and check swap history status
     */
    async function loadSwapHistory(username) {
        if (!username) return [];

        let history = JSON.parse(localStorage.getItem('swapHistory') || '[]');
        const userHistory = history.filter(h => h.username === username);
        
        // Check status for pending swaps AND re-check completed swaps with old data
        for (let swap of userHistory) {
            // Re-check completed swaps that have 'uswap-transfer' or 'uswap-refund' placeholder
            if ((swap.status === 'completed' || swap.status === 'refunded') && 
                (swap.txIdReceived === 'uswap-transfer' || swap.txIdReceived === 'uswap-refund')) {
                // Re-fetch to get actual transaction ID
                const toToken = swap.toToken;
                let result;
                
                if (toToken === "HIVE") {
                    result = await checkUswapHiveTransfers(swap.txIdSent, username);
                } else {
                    result = await checkUswapEngineTransfers(swap.txIdSent, username);
                }
                
                if (result.found) {
                    swap.txIdReceived = result.txId;
                }
            }
            
            if (swap.status === 'pending') {
                // First, check if swap completed or refunded by checking uswap history
                const toToken = swap.toToken;
                let result;
                
                if (toToken === "HIVE") {
                    result = await checkUswapHiveTransfers(swap.txIdSent, username);
                } else {
                    result = await checkUswapEngineTransfers(swap.txIdSent, username);
                }
                
                if (result.found) {
                    swap.status = 'completed';
                    swap.amountReceived = result.amount;
                    swap.txIdReceived = result.txId;
                    swap.swappedQty = result.swappedQty;
                    swap.swappedPrice = result.swappedPrice;
                    continue;
                }
                
                // Not completed, check for refund (same token returned)
                if (swap.fromToken === "HIVE") {
                    const refund = await checkUswapHiveTransfers(swap.txIdSent, username);
                    if (refund.found) {
                        swap.status = 'refunded';
                        swap.amountReceived = refund.amount;
                        swap.txIdReceived = refund.txId;
                        continue;
                    }
                } else {
                    const refund = await checkUswapEngineTransfers(swap.txIdSent, username);
                    if (refund.found) {
                        swap.status = 'refunded';
                        swap.amountReceived = refund.amount;
                        swap.txIdReceived = refund.txId;
                        continue;
                    }
                }
                
                // Not completed and not refunded
                // Give time for blockchain/side chain to process before checking existence
                const now = Date.now();
                const swapAge = now - swap.timestamp; // in milliseconds
                const minimumWaitTime = 30 * 1000; // 30 seconds
                const maximumWaitTime = 10 * 60 * 1000; // 10 minutes
                
                // Only check if transaction exists after minimum wait time
                if (swapAge > minimumWaitTime && swapAge < maximumWaitTime) {
                    const txExists = await verifyTransactionExists(swap.txIdSent, swap.fromToken);
                    
                    if (!txExists) {
                        swap.status = 'not-sent';
                    }
                }
                // If less than 30 seconds or more than 10 minutes, keep as pending
            }
        }
        
        // Update localStorage with new status
        localStorage.setItem('swapHistory', JSON.stringify(history));
        
        return userHistory.slice(0, 10);
    }

    /**
     * Fetch fee configuration from server
     */
    async function fetchFeeConfig() {
        try {
            const response = await Utils.withTimeout(
                axios.get(CONFIG.USWAP_FEE_JSON),
                5000
            );
            
            if (response.data) {
                feeConfig.BASE_FEE = Utils.parseNumber(response.data.BASE_FEE, feeConfig.BASE_FEE);
                feeConfig.MIN_BASE_FEE = Utils.parseNumber(response.data.MIN_BASE_FEE, feeConfig.MIN_BASE_FEE);
                feeConfig.DIFF_COEFFICIENT = Utils.parseNumber(response.data.DIFF_COEFFICIENT, feeConfig.DIFF_COEFFICIENT);
                feeConfig.BASE_PRICE_HIVE_TO_SHIVE = Utils.parseNumber(response.data.BASE_PRICE_HIVE_TO_SHIVE, feeConfig.BASE_PRICE_HIVE_TO_SHIVE);
                
                console.log("Fee config loaded:", feeConfig);
            }
        } catch (error) {
            const handled = Utils.handleError(error, 'SwapManager.fetchFeeConfig');
            console.error(handled.message);
        }
    }

    /**
     * Calculate swap fee and output based on amount and direction
     * Uses the exact formula from the original uswap.app
     */
    function calculateFee(amount, fromToken, toToken) {
        if (!Utils.isPositiveNumber(amount)) {
            return { feeAmount: 0, feePercent: 0 };
        }

        // Get pool liquidity amounts
        const fromPool = fromToken === "HIVE" ? CONFIG.HIVEPOOL : CONFIG.SHIVEPOOL;
        const totalPool = CONFIG.HIVEPOOL + CONFIG.SHIVEPOOL;
        
        // Calculate pool difference ratio
        const diff = ((amount * 0.5 + fromPool) / totalPool) - 0.5;
        
        // Calculate adjusted base fee (lower when balancing pools)
        const adjusted_base_fee = Math.max(
            feeConfig.BASE_FEE * (1 - 2 * Math.abs(diff)),
            feeConfig.MIN_BASE_FEE
        );
        
        // Calculate price with pool imbalance adjustment
        let price;
        if (fromToken === "HIVE") {
            price = feeConfig.BASE_PRICE_HIVE_TO_SHIVE - (2 * diff * feeConfig.DIFF_COEFFICIENT);
        } else {
            price = (1 / feeConfig.BASE_PRICE_HIVE_TO_SHIVE) - (2 * diff * feeConfig.DIFF_COEFFICIENT);
        }
        
        // Calculate expected output
        const expectedOutput = (amount * price) * (1 - adjusted_base_fee);
        
        // Calculate fee amount in input token
        const feeAmount = amount * adjusted_base_fee;
        const feePercent = adjusted_base_fee * 100;
        
        return {
            feeAmount: Utils.roundTo(feeAmount, 8),
            feePercent: Utils.roundTo(feePercent, 4),
            expectedOutput: Utils.roundTo(expectedOutput, 8)
        };
    }

    /**
     * Calculate expected output amount
     * Uses the new calculateFee function that includes output
     */
    function calculateExpectedOutput(inputAmount, fromToken, toToken) {
        if (!Utils.isPositiveNumber(inputAmount)) {
            return { expected: 0, fee: 0, feePercent: 0 };
        }

        const result = calculateFee(inputAmount, fromToken, toToken);

        return {
            expected: Math.floor(result.expectedOutput * CONFIG.DECIMAL) / CONFIG.DECIMAL,
            fee: result.feeAmount,
            feePercent: result.feePercent
        };
    }

    /**
     * Update swap calculation
     */
    function updateSwapCalculation(amount, fromToken, toToken, slippage) {
        currentSwap.from = fromToken;
        currentSwap.to = toToken;
        currentSwap.amount = Utils.parseNumber(amount, 0);
        currentSwap.slippage = Utils.parseNumber(slippage, 0.01);

        const result = calculateExpectedOutput(currentSwap.amount, fromToken, toToken);
        currentSwap.expected = result.expected;
        currentSwap.fee = result.fee;
        currentSwap.feePercent = result.feePercent;
        
        // Calculate minimum receive with slippage protection
        const slippageFactor = 1 - (currentSwap.slippage / 100);
        currentSwap.minReceive = Utils.roundTo(
            Utils.safeMultiply(currentSwap.expected, slippageFactor),
            3
        );

        // Update UI
        UIManager.updateSwapDisplay(currentSwap);
        
        // Validate and enable/disable swap button
        validateSwapButton();

        return currentSwap;
    }

    /**
     * Reverse swap direction
     */
    function reverseSwap() {
        const temp = currentSwap.from;
        currentSwap.from = currentSwap.to;
        currentSwap.to = temp;

        // Update UI selects
        const inputSelect = document.getElementById("input");
        const outputSelect = document.getElementById("output");
        if (inputSelect) {
            inputSelect.value = currentSwap.from;
            inputSelect.dispatchEvent(new Event('change'));
        }
        if (outputSelect) {
            outputSelect.value = currentSwap.to;
            outputSelect.dispatchEvent(new Event('change'));
        }

        // Recalculate if amount exists
        if (Utils.isPositiveNumber(currentSwap.amount)) {
            updateSwapCalculation(
                currentSwap.amount, 
                currentSwap.from, 
                currentSwap.to, 
                currentSwap.slippage
            );
        }

        // Update fee ticker labels
        const feeTicker = document.getElementById("feeticker");
        const minReceiveSymbol = document.getElementById("minreceivesymbol");
        if (feeTicker) feeTicker.textContent = currentSwap.from;
        if (minReceiveSymbol) minReceiveSymbol.textContent = currentSwap.to;
    }

    /**
     * Validate if swap button should be enabled
     * Can be called with parameters or will use currentSwap values
     */
    function validateSwapButton(inputAmount = null, inputFrom = null, inputTo = null) {
        const amount = inputAmount !== null ? inputAmount : currentSwap.amount;
        const fromToken = inputFrom || currentSwap.from;
        const toToken = inputTo || currentSwap.to;
        
        // Check if amount is valid and positive
        if (!amount || !Utils.isPositiveNumber(amount) || amount <= 0) {
            UIManager.disableSwapButton();
            return false;
        }

        // Check if amount meets minimum requirement
        if (amount < CONFIG.MINIMUM_SWAP) {
            UIManager.disableSwapButton();
            return false;
        }

        // Check if user has sufficient balance
        const balances = WalletManager.getBalances();
        const availableBalance = Utils.parseNumber(balances[fromToken], 0);
        
        if (availableBalance < amount) {
            UIManager.disableSwapButton();
            return false;
        }

        // Check if bridge has sufficient liquidity for the output token
        const liquidity = MarketManager.getLiquidity();
        const expectedOutput = calculateExpectedOutput(amount, fromToken, toToken).expected;
        
        // Map token to liquidity key
        const liquidityKey = toToken === "HIVE" ? "hive" : "swapHive";
        const availableLiquidity = Utils.parseNumber(liquidity[liquidityKey], 0);
        
        if (expectedOutput > availableLiquidity) {
            UIManager.disableSwapButton();
            return false;
        }

        // All validations passed - enable button
        UIManager.enableSwapButton();
        return true;
    }

    /**
     * Validate swap (returns validation result)
     */
    function validateSwap() {
        const username = WalletManager.getCurrentUser();
        if (!username) {
            throw new Utils.ValidationError("Please load your wallet first");
        }

        const balance = WalletManager.getBalance(currentSwap.from);
        const validation = Utils.validateSwapAmount(
            currentSwap.amount,
            balance,
            CONFIG.MINIMUM_SWAP
        );

        if (!validation.valid) {
            throw new Utils.ValidationError(validation.errors.join('. '));
        }

        return true;
    }

    /**
     * Execute HIVE to SWAP.HIVE swap with Keychain
     */
    async function executeHiveToSwapHive(amount, username, memo) {
        return new Promise((resolve, reject) => {
            if (!window.hive_keychain) {
                reject(new Utils.TransactionError("Hive Keychain extension not found. Please install it."));
                return;
            }

            const transferAmount = Utils.roundTo(amount, 3).toFixed(3) + " HIVE";

            hive_keychain.requestTransfer(
                username,
                CONFIG.BRIDGE_USER,
                Utils.roundTo(amount, 3).toFixed(3),
                memo,
                "HIVE",
                (response) => {
                    if (response.success) {
                        // Extract transaction ID from response
                        const txId = response.result?.id || response.result?.transaction_id || response.result || null;
                        resolve({ 
                            success: true, 
                            transactionId: txId,
                            response: response 
                        });
                    } else {
                        reject(new Utils.TransactionError(
                            response.message || "Transaction rejected",
                            null
                        ));
                    }
                }
            );
        });
    }

    /**
     * Execute SWAP.HIVE to HIVE swap with Keychain
     */
    async function executeSwapHiveToHive(amount, username, memo) {
        return new Promise((resolve, reject) => {
            if (!window.hive_keychain) {
                reject(new Utils.TransactionError("Hive Keychain extension not found. Please install it."));
                return;
            }

            const json = JSON.stringify({
                contractName: "tokens",
                contractAction: "transfer",
                contractPayload: {
                    symbol: "SWAP.HIVE",
                    to: CONFIG.BRIDGE_USER,
                    quantity: Utils.roundTo(amount, 3).toFixed(3),
                    memo: memo
                }
            });

            hive_keychain.requestCustomJson(
                username,
                "ssc-mainnet-hive",
                "Active",
                json,
                "SWAP.HIVE Transfer",
                (response) => {
                    if (response.success) {
                        // Extract transaction ID from response
                        const txId = response.result?.id || response.result?.transaction_id || response.result || null;
                        resolve({ 
                            success: true, 
                            transactionId: txId,
                            response: response 
                        });
                    } else {
                        reject(new Utils.TransactionError(
                            response.message || "Transaction rejected",
                            null
                        ));
                    }
                }
            );
        });
    }

    /**
     * Execute swap with comprehensive error handling
     */
    async function executeSwap() {
        try {
            // Validate swap
            validateSwap();

            UIManager.showLoading("Processing swap...");
            UIManager.disableSwapButton();

            const username = WalletManager.getCurrentUser();
            const minReceiveFormatted = Utils.roundTo(currentSwap.minReceive, 3).toFixed(3);
            const memo = minReceiveFormatted;

            let result;
            if (currentSwap.from === "HIVE") {
                result = await executeHiveToSwapHive(currentSwap.amount, username, memo);
            } else {
                result = await executeSwapHiveToHive(currentSwap.amount, username, memo);
            }

            // Show initial success with transaction ID
            if (result.transactionId) {
                UIManager.showSuccess(`Transaction submitted! ID: ${result.transactionId}`);
            } else {
                UIManager.showSuccess("Transaction submitted!");
            }

            UIManager.hideLoading();
            
            // Add to swap history tracking (will be monitored in background)
            if (result.transactionId) {
                addSwapToHistory(result.transactionId, currentSwap.amount, currentSwap.from, username);
            }
            
            // Reload balance after a short delay
            setTimeout(async () => {
                await WalletManager.refreshBalance();
            }, 5000);
            
            UIManager.clearSwapInputs();

            return true;

        } catch (error) {
            const handled = Utils.handleError(error, 'SwapManager.executeSwap');
            UIManager.hideLoading();
            UIManager.showError(handled.message);
            // Re-validate button after error
            validateSwapButton();
            return false;
        }
    }

    /**
     * Get current swap details
     */
    function getCurrentSwap() {
        return currentSwap;
    }

    /**
     * Initialize swap module
     */
    async function initialize() {
        await fetchFeeConfig();
        console.log("Swap Manager initialized");
    }

    // Public API
    return {
        initialize,
        updateSwapCalculation,
        reverseSwap,
        executeSwap,
        getCurrentSwap,
        calculateExpectedOutput,
        validateButton: validateSwapButton,
        loadSwapHistory
    };
})();
