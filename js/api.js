/**
 * API Management Module
 * Handles Hive and Hive Engine API node selection and management
 */

const APIManager = (function() {
    let ssc = null;
    let selectedHiveNode = null;
    let selectedEngineNode = null;

    /**
     * Get selected Hive endpoint from localStorage or default
     */
    async function getSelectedEndpoint() {
        const saved = localStorage.getItem("selectedEndpoint");
        return saved || CONFIG.DEFAULT_HIVE_ENDPOINT;
    }

    /**
     * Get selected Engine endpoint from localStorage or default
     */
    async function getSelectedEngEndpoint() {
        const saved = localStorage.getItem("selectedEngEndpoint");
        return saved || CONFIG.DEFAULT_ENGINE_ENDPOINT;
    }

    /**
     * Initialize Hive API with selected node
     */
    async function initializeHiveAPI() {
        selectedHiveNode = await getSelectedEndpoint();
        console.log("SELECTED HIVE API NODE:", selectedHiveNode);
        
        // Set options with timeout
        hive.api.setOptions({ 
            url: selectedHiveNode,
            timeout: 8000, // 8 second timeout
            failover_threshold: 3,
            rebroadcast_threshold: 3
        });
        
        const button = document.getElementById("popup-button-hive");
        if (button) {
            button.value = selectedHiveNode;
            button.innerHTML = selectedHiveNode;
        }
        
        return selectedHiveNode;
    }

    /**
     * Initialize Hive Engine API with selected node
     */
    async function initializeEngineAPI() {
        selectedEngineNode = await getSelectedEngEndpoint();
        console.log("SELECTED ENGINE API NODE:", selectedEngineNode);
        
        // Check if SSC is available before initializing
        if (typeof SSC === 'undefined') {
            console.error('SSC library not loaded!');
            throw new Error('SSC library is not available');
        }
        
        ssc = new SSC(selectedEngineNode);
        
        const button = document.getElementById("popup-button-engine");
        if (button) {
            button.value = selectedEngineNode;
            button.innerHTML = selectedEngineNode;
        }
        
        return selectedEngineNode;
    }

    /**
     * Check if a Hive node is working
     */
    async function checkHiveNodeStatus(nodeUrl, statusElement) {
        try {
            const response = await axios.get(nodeUrl, { timeout: 5000 });
            if (response.status === 200) {
                statusElement.textContent = "Working";
                statusElement.classList.remove("fail");
                statusElement.classList.add("working");
                return true;
            }
        } catch (error) {
            statusElement.textContent = "Fail";
            statusElement.classList.remove("working");
            statusElement.classList.add("fail");
            return false;
        }
    }

    /**
     * Check if an Engine node is working
     */
    async function checkEngineNodeStatus(nodeUrl, statusElement) {
        try {
            const response = await axios.get(nodeUrl, { timeout: 5000 });
            if (response.status === 200) {
                statusElement.textContent = "Working";
                statusElement.classList.remove("fail");
                statusElement.classList.add("working");
                return true;
            }
        } catch (error) {
            statusElement.textContent = "Fail";
            statusElement.classList.remove("working");
            statusElement.classList.add("fail");
            return false;
        }
    }

    /**
     * Populate Hive nodes table
     */
    async function addHiveNodes() {
        const tableBody = document.querySelector("#api-list-hive tbody");
        if (!tableBody) return;

        const workingNodes = [];
        const failedNodes = [];

        // Clear existing content
        tableBody.innerHTML = "";

        // Add all nodes to table
        for (const nodeUrl of CONFIG.HIVE_RPC_NODES) {
            const row = document.createElement("tr");
            const urlCell = document.createElement("td");
            const statusCell = document.createElement("td");

            urlCell.textContent = nodeUrl;
            urlCell.classList.add("node-url");
            statusCell.textContent = "Checking...";

            row.appendChild(urlCell);
            row.appendChild(statusCell);
            tableBody.appendChild(row);

            // Check node status
            checkHiveNodeStatus(nodeUrl, statusCell);
        }

        // Reorder nodes after checking (working first)
        setTimeout(() => {
            const rows = Array.from(tableBody.getElementsByTagName("tr"));
            
            rows.forEach((row) => {
                if (row.lastChild.textContent === "Working") {
                    workingNodes.push(row);
                } else {
                    failedNodes.push(row);
                }
            });

            tableBody.innerHTML = "";
            workingNodes.forEach((row) => tableBody.appendChild(row));
            failedNodes.forEach((row) => tableBody.appendChild(row));
        }, 5000);
    }

    /**
     * Populate Engine nodes table
     */
    async function addEngineNodes() {
        const tableBody = document.querySelector("#api-list-engine tbody");
        if (!tableBody) return;

        const workingNodes = [];
        const failedNodes = [];

        // Clear existing content
        tableBody.innerHTML = "";

        // Add all nodes to table
        for (const nodeUrl of CONFIG.ENGINE_RPC_NODES) {
            const row = document.createElement("tr");
            const urlCell = document.createElement("td");
            const statusCell = document.createElement("td");

            urlCell.textContent = nodeUrl;
            urlCell.classList.add("node-url");
            statusCell.textContent = "Checking...";

            row.appendChild(urlCell);
            row.appendChild(statusCell);
            tableBody.appendChild(row);

            // Check node status
            checkEngineNodeStatus(nodeUrl, statusCell);
        }

        // Reorder nodes after checking (working first)
        setTimeout(() => {
            const rows = Array.from(tableBody.getElementsByTagName("tr"));
            
            rows.forEach((row) => {
                if (row.lastChild.textContent === "Working") {
                    workingNodes.push(row);
                } else {
                    failedNodes.push(row);
                }
            });

            tableBody.innerHTML = "";
            workingNodes.forEach((row) => tableBody.appendChild(row));
            failedNodes.forEach((row) => tableBody.appendChild(row));
        }, 5000);
    }

    /**
     * Setup Hive node selector popup
     */
    function setupHiveNodeSelector() {
        const button = document.getElementById("popup-button-hive");
        const popup = document.getElementById("popup-container-hive");
        const closeButton = document.getElementById("close-button-hive");
        const tableBody = document.querySelector("#api-list-hive tbody");

        if (!button || !popup || !closeButton || !tableBody) return;

        let interval;

        // Open popup
        button.addEventListener("click", () => {
            popup.style.display = "flex";
            button.disabled = true;
            addHiveNodes();
            interval = setInterval(addHiveNodes, 60000);
        });

        // Close popup
        closeButton.addEventListener("click", () => {
            popup.style.display = "none";
            button.disabled = false;
            if (interval) clearInterval(interval);
            tableBody.innerHTML = "";
        });

        // Select node on row click
        tableBody.addEventListener("click", (event) => {
            const target = event.target;
            if (target && target.nodeName === "TD") {
                const nodeUrl = target.parentNode.cells[0].textContent;
                
                hive.api.setOptions({ url: nodeUrl });
                button.value = nodeUrl;
                button.innerHTML = nodeUrl;
                localStorage.setItem("selectedEndpoint", nodeUrl);
                
                popup.style.display = "none";
                button.disabled = false;
                tableBody.innerHTML = "";
                
                if (interval) clearInterval(interval);
                
                setTimeout(() => location.reload(), 1000);
            }
        });
    }

    /**
     * Setup Engine node selector popup
     */
    function setupEngineNodeSelector() {
        const button = document.getElementById("popup-button-engine");
        const popup = document.getElementById("popup-container-engine");
        const closeButton = document.getElementById("close-button-engine");
        const tableBody = document.querySelector("#api-list-engine tbody");

        if (!button || !popup || !closeButton || !tableBody) return;

        let interval;

        // Open popup
        button.addEventListener("click", () => {
            popup.style.display = "flex";
            button.disabled = true;
            addEngineNodes();
            interval = setInterval(addEngineNodes, 60000);
        });

        // Close popup
        closeButton.addEventListener("click", () => {
            popup.style.display = "none";
            button.disabled = false;
            if (interval) clearInterval(interval);
            tableBody.innerHTML = "";
        });

        // Select node on row click
        tableBody.addEventListener("click", (event) => {
            const target = event.target;
            if (target && target.nodeName === "TD") {
                const nodeUrl = target.parentNode.cells[0].textContent;
                
                ssc = new SSC(nodeUrl);
                button.value = nodeUrl;
                button.innerHTML = nodeUrl;
                localStorage.setItem("selectedEngEndpoint", nodeUrl);
                
                popup.style.display = "none";
                button.disabled = false;
                tableBody.innerHTML = "";
                
                if (interval) clearInterval(interval);
                
                setTimeout(() => location.reload(), 1000);
            }
        });
    }

    /**
     * Initialize all API configurations
     */
    async function initialize() {
        try {
            // Set alternative API endpoints for Hive
            hive.config.set('alternative_api_endpoints', CONFIG.HIVE_RPC_NODES);
            
            // Initialize both APIs
            await initializeHiveAPI();
            await initializeEngineAPI();
            
            // Setup node selectors
            setupHiveNodeSelector();
            setupEngineNodeSelector();
            
            console.log("✅ API Manager initialized successfully");
            console.log("📡 Hive Node:", selectedHiveNode);
            console.log("🔗 Engine Node:", selectedEngineNode);
        } catch (error) {
            console.error("❌ Error initializing API Manager:", error);
            throw error;
        }
    }

    /**
     * Try API call with automatic node failover
     */
    async function tryWithFailover(apiFn, maxAttempts = 3) {
        const availableNodes = CONFIG.HIVE_RPC_NODES.filter(node => node !== selectedHiveNode);
        let currentNode = selectedHiveNode;
        let lastError;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                // Set current node
                hive.api.setOptions({ 
                    url: currentNode,
                    timeout: 8000
                });
                
                // Try the API call with timeout
                const result = await Utils.withTimeout(apiFn(), 10000);
                
                // If successful and we switched nodes, save the new node
                if (currentNode !== selectedHiveNode) {
                    console.log(`✅ Switched to working node: ${currentNode}`);
                    selectedHiveNode = currentNode;
                    localStorage.setItem('selectedEndpoint', currentNode);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Node ${currentNode} failed (attempt ${attempt + 1}/${maxAttempts}):`, error.message);
                
                // Try next node if available
                if (attempt < maxAttempts - 1 && availableNodes.length > 0) {
                    currentNode = availableNodes[attempt % availableNodes.length];
                    console.log(`🔄 Switching to backup node: ${currentNode}`);
                    await Utils.sleep(500); // Brief delay before retry
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Get SSC instance
     */
    function getSSC() {
        return ssc;
    }

    // Public API
    return {
        initialize,
        getSSC,
        initializeHiveAPI,
        initializeEngineAPI,
        getSelectedEndpoint,
        getSelectedEngEndpoint,
        tryWithFailover
    };
})();
