/**
 * Main Application Entry Point
 * Initializes all modules and starts the application
 */

(async function() {
    console.log("=".repeat(50));
    console.log("SWAP HIVE - Modern UI");
    console.log("Initializing application...");
    console.log("=".repeat(50));

    /**
     * Initialize application
     */
    async function initializeApp() {
        try {
            // Clear URL parameters
            window.history.replaceState({}, document.title, "/");

            // Initialize API Manager (must be first)
            console.log("⏳ Initializing API Manager...");
            await APIManager.initialize();
            console.log("✅ API Manager initialized");

            // Initialize Swap Manager (loads fee config)
            console.log("⏳ Initializing Swap Manager...");
            await SwapManager.initialize();
            console.log("✅ Swap Manager initialized");

            // Initialize Market Manager (fetches liquidity, updates CONFIG pools)
            // IMPORTANT: Must run before user can perform swaps
            console.log("⏳ Initializing Market Manager...");
            await MarketManager.initialize();
            console.log("✅ Market Manager initialized");

            // Initialize UI Manager (must be last, enables user interaction)
            console.log("⏳ Initializing UI Manager...");
            UIManager.initialize();
            console.log("✅ UI Manager initialized");

            console.log("=".repeat(50));
            console.log("✅ Application initialized successfully!");
            console.log("=".repeat(50));

        } catch (error) {
            console.error("❌ Error initializing application:", error);
            alert("Failed to initialize application. Please refresh the page.");
        }
    }

    // Wait for DOM to be ready
    $(window).on("load", async function() {
        await initializeApp();
    });

    // jQuery ready function for backwards compatibility
    $(document).ready(function() {
        console.log("📄 DOM ready");
    });

})();
