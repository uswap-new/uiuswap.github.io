/**
 * Configuration and Constants
 * Contains all configuration values, RPC nodes, and constants
 */

const CONFIG = {
    // Fee Configuration
    DECIMAL: 1000,
    BASE_FEE: 0.002,
    MIN_BASE_FEE: 0.00075,
    DIFF_COEFFICIENT: 0.00575,
    BASE_PRICE_HIVE_TO_SHIVE: 1.00,
    
    // Pool Configuration
    HIVEPOOL: 24900,
    SHIVEPOOL: 24900,
    BRIDGE_USER: "uswap",
    
    // API URLs
    COINGECKO_HIVE_URL: "https://api.coingecko.com/api/v3/simple/price?ids=hive&vs_currencies=usd",
    COINGECKO_HBD_URL: "https://api.coingecko.com/api/v3/simple/price?ids=hive_dollar&vs_currencies=usd",
    USWAP_FEE_JSON: "https://fee.uswap.app/fee.json",
    
    // Hive RPC Nodes
    HIVE_RPC_NODES: [
        "https://api.deathwing.me",
        "https://hive.roelandp.nl",
        "https://api.openhive.network",
        "https://rpc.ausbit.dev",
        "https://hived.emre.sh",
        "https://hive-api.arcange.eu",
        "https://api.hive.blog",
        "https://api.c0ff33a.uk",
        "https://rpc.ecency.com",
        "https://anyx.io",
        "https://techcoderx.com",
        "https://api.hive.blue",
        "https://rpc.mahdiyari.info"
    ],
    
    // Hive Engine RPC Nodes
    ENGINE_RPC_NODES: [
        "https://api.primersion.com",
        "https://api2.hive-engine.com/rpc",
        "https://enginerpc.com",
        "https://api.hive-engine.com/rpc",
        "https://herpc.actifit.io",
        "https://herpc.dtools.dev"
    ],
    
    // Default Endpoints
    DEFAULT_HIVE_ENDPOINT: "https://anyx.io",
    DEFAULT_ENGINE_ENDPOINT: "https://enginerpc.com",
    
    // Minimum Swap Amount
    MINIMUM_SWAP: 1
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
