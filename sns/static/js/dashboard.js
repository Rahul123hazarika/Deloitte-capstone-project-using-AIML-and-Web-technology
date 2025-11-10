// Global variables
let totalPredictions = 0;
let subcategories = []; // Will be populated by loadSubcategories

// DOM elements
const predictionModal = document.getElementById('prediction-modal');
const trainingModal = document.getElementById('training-modal');
const notification = document.getElementById('notification');
const predictionForm = document.getElementById('prediction-form');
const predictionResult = document.getElementById('prediction-result');
const analyticsSection = document.getElementById('analytics-section');
const realtimeSubcategoryChartContainer = document.getElementById('realtime-subcategory-chart-container');
const realtimeChartSubcategoryNameSpan = document.getElementById('realtime-chart-subcategory-name');


// Initialize the app
document.addEventListener('DOMContentLoaded', function () {
    checkModelStatus(); // Initial status check
    // loadSubcategories(); // Subcategories will be loaded after model status check if model is trained, or during analytics load
    setupEventListeners(); // Setup all event listeners
    showMainDashboardContent(); // Ensure dashboard is the default view
});

function setupEventListeners() {
    // Modal controls
    document.getElementById('new-prediction-btn').addEventListener('click', openPredictionModal);
    document.getElementById('predict-platform-btn').addEventListener('click', openPredictionModal);
    document.getElementById('train-model-btn').addEventListener('click', openTrainingModal);

    const closeModalButton = document.getElementById('close-modal');
    if (closeModalButton) closeModalButton.addEventListener('click', closePredictionModal);

    const closeTrainingModalButton = document.getElementById('close-training-modal');
    if (closeTrainingModalButton) closeTrainingModalButton.addEventListener('click', closeTrainingModal);

    // Form submissions
    if (predictionForm) predictionForm.addEventListener('submit', handlePrediction);

    const startTrainingButton = document.getElementById('start-training');
    if (startTrainingButton) startTrainingButton.addEventListener('click', handleTraining);

    // Navigation
    document.getElementById('dashboard-nav').addEventListener('click', (e) => {
        e.preventDefault();
        showMainDashboardContent();
    });
    document.getElementById('predict-nav').addEventListener('click', (e) => {
        e.preventDefault();
        openPredictionModal();
    });
    document.getElementById('train-nav').addEventListener('click', (e) => {
        e.preventDefault();
        openTrainingModal();
    });
    document.getElementById('analytics-nav').addEventListener('click', handleAnalyticsClick);

    const refreshStatusButton = document.getElementById('refresh-status');
    if (refreshStatusButton) refreshStatusButton.addEventListener('click', checkModelStatus);

    // Logout Button
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            if (window.FLASK_API_ENDPOINTS && window.FLASK_API_ENDPOINTS.logout) {
                window.location.href = window.FLASK_API_ENDPOINTS.logout;
            } else {
                console.warn("FLASK_API_ENDPOINTS.logout not found, using hardcoded '/logout'");
                window.location.href = '/logout';
            }
        });
    }

    // Sidebar toggle
    const sidebarToggleButton = document.getElementById('sidebar-toggle');
    if (sidebarToggleButton) sidebarToggleButton.addEventListener('click', toggleSidebar);

    // Close modals when clicking outside
    window.addEventListener('click', function (e) {
        if (predictionModal && e.target === predictionModal) {
            closePredictionModal();
        }
        if (trainingModal && e.target === trainingModal) {
            closeTrainingModal();
        }
    });
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const icon = document.querySelector('#sidebar-toggle i');

    if (!sidebar || !icon) return;

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        icon.classList.remove('fa-chevron-left');
        icon.classList.add('fa-chevron-right');
    } else {
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-left');
    }
}


async function checkModelStatus() {
    const refreshButton = document.getElementById('refresh-status');
    const refreshIcon = refreshButton ? refreshButton.querySelector('i') : null;

    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    if (refreshButton) refreshButton.disabled = true;

    try {
        const response = await fetch('/status');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();

        updateStatusIndicator('status-trained', data.model_trained);
        updateStatusIndicator('status-data', data.csv_file_exists);

        const predictPlatformBtn = document.getElementById('predict-platform-btn');
        const newPredictionBtnWelcome = document.getElementById('new-prediction-btn');
        const trainModelBtnQuickAction = document.getElementById('train-model-btn');

        if (predictPlatformBtn) predictPlatformBtn.disabled = !data.model_trained;
        if (newPredictionBtnWelcome) newPredictionBtnWelcome.disabled = !data.model_trained;
        if (trainModelBtnQuickAction) trainModelBtnQuickAction.disabled = !data.csv_file_exists;

        const predictionFormSubmitButton = document.querySelector('#prediction-form button[type="submit"]');
        if (predictionFormSubmitButton) predictionFormSubmitButton.disabled = !data.model_trained;

        if (data.model_trained) {
            await loadSubcategories(); // Load subcategories if model is trained
        } else {
            subcategories = []; // Clear subcategories if model not trained
            document.getElementById('categories-count').textContent = '-';
            const subcategorySelect = document.getElementById('subcategory');
            if (subcategorySelect) subcategorySelect.innerHTML = '<option value="">Select Category (Train Model First)</option>';
            document.getElementById('model-accuracy').textContent = '-';
        }
    } catch (error) {
        console.error('Error refreshing status:', error);
        showNotification('Failed to refresh status: ' + error.message, 'error');
        updateStatusIndicator('status-trained', false);
        updateStatusIndicator('status-data', false);
        subcategories = [];
        document.getElementById('categories-count').textContent = '-';
        document.getElementById('model-accuracy').textContent = '-';
        const predictPlatformBtn = document.getElementById('predict-platform-btn');
        const newPredictionBtnWelcome = document.getElementById('new-prediction-btn');
        const trainModelBtnQuickAction = document.getElementById('train-model-btn');
        if (predictPlatformBtn) predictPlatformBtn.disabled = true;
        if (newPredictionBtnWelcome) newPredictionBtnWelcome.disabled = true;
        if (trainModelBtnQuickAction) trainModelBtnQuickAction.disabled = true;
    } finally {
        if (refreshIcon) refreshIcon.classList.remove('fa-spin');
        if (refreshButton) refreshButton.disabled = false;
    }
}


function updateStatusIndicator(elementId, isActive) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const indicator = element.querySelector('span:first-child');
    if (!indicator) return;

    if (isActive) {
        indicator.classList.remove('bg-red-500');
        indicator.classList.add('bg-green-500');
    } else {
        indicator.classList.remove('bg-green-500');
        indicator.classList.add('bg-red-500');
    }
}

async function loadSubcategories() {
    try {
        const response = await fetch('/get_subcategories');
        const data = await response.json();
        const select = document.getElementById('subcategory');
        const categoriesCountEl = document.getElementById('categories-count');

        if (data.subcategories && data.subcategories.length > 0) {
            subcategories = data.subcategories; // Update global subcategories
            if (select) {
                select.innerHTML = '<option value="">Select Category</option>';
                data.subcategories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    select.appendChild(option);
                });
            }
            if (categoriesCountEl) categoriesCountEl.textContent = data.subcategories.length;
        } else {
            subcategories = [];
            if (select) select.innerHTML = '<option value="">No categories available (Train Model)</option>';
            if (categoriesCountEl) categoriesCountEl.textContent = '0';
        }
    } catch (error) {
        console.error('Error loading subcategories:', error);
        subcategories = [];
        const categoriesCountEl = document.getElementById('categories-count');
        if (categoriesCountEl) categoriesCountEl.textContent = '-';
        const select = document.getElementById('subcategory');
        if (select) select.innerHTML = '<option value="">Error loading categories</option>';
    }
}

function openPredictionModal() {
    if (predictionModal) predictionModal.classList.add('show');
    if (predictionResult) predictionResult.classList.remove('show');
    if (realtimeSubcategoryChartContainer) realtimeSubcategoryChartContainer.classList.add('hidden');
}

function closePredictionModal() {
    if (predictionModal) predictionModal.classList.remove('show');
    if (predictionForm) predictionForm.reset();
    if (predictionResult) predictionResult.classList.remove('show');
    if (realtimeSubcategoryChartContainer) realtimeSubcategoryChartContainer.classList.add('hidden');
    if (typeof Plotly !== 'undefined') {
        Plotly.purge('realtimeSubcategoryPriceChart');
        Plotly.purge('realtimeSubcategoryRatingChart');
    }
}

function openTrainingModal() {
    if (trainingModal) trainingModal.classList.add('show');
    const trainingProgress = document.getElementById('training-progress');
    if (trainingProgress) trainingProgress.classList.add('hidden');
}

function closeTrainingModal() {
    if (trainingModal) trainingModal.classList.remove('show');
}

async function handlePrediction(e) {
    e.preventDefault();
    if (realtimeSubcategoryChartContainer) realtimeSubcategoryChartContainer.classList.add('hidden');
    if (typeof Plotly !== 'undefined') {
        Plotly.purge('realtimeSubcategoryPriceChart');
        Plotly.purge('realtimeSubcategoryRatingChart');
    }


    const subcategoryValue = document.getElementById('subcategory').value;
    if (!subcategoryValue) {
        showNotification('Please select a subcategory.', 'error');
        return;
    }

    const formData = { subcategory: subcategoryValue };
    const productNameValue = document.getElementById('product-name').value.trim();
    const sellingPriceValue = document.getElementById('selling-price').value.trim();
    const mrpValue = document.getElementById('mrp').value.trim();

    // Only add fields to formData if they have a value, to allow backend to use medians
    if (productNameValue !== "") { // product_name is not used by backend for prediction features, but good to keep if used elsewhere
        formData.product_name = productNameValue;
    }
    if (sellingPriceValue !== "") {
        const sp = parseFloat(sellingPriceValue);
        if (!isNaN(sp)) formData.selling_price = sp;
    }
    if (mrpValue !== "") {
        const mrp = parseFloat(mrpValue);
        if (!isNaN(mrp)) formData.mrp = mrp;
    }
    // Add other fields (discount, rating, rating_count) similarly if you have inputs for them
    // Example:
    // const discountValue = document.getElementById('discount')?.value.trim();
    // if (discountValue !== "" && discountValue !== undefined) {
    //     const disc = parseFloat(discountValue);
    //     if (!isNaN(disc)) formData.discount = disc;
    // }


    const submitButton = predictionForm.querySelector('button[type="submit"]');
    const originalButtonHtml = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Predicting...';

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const result = await response.json();

        if (result.error) {
            showNotification(result.error, 'error');
            if (predictionResult) predictionResult.classList.remove('show');
        } else {
            displayPredictionResult(result);
            totalPredictions++;
            document.getElementById('total-predictions').textContent = totalPredictions;
            showNotification('Prediction completed successfully!', 'success');

            if (result.subcategory_plot_data && realtimeSubcategoryChartContainer) {
                if (realtimeChartSubcategoryNameSpan) realtimeChartSubcategoryNameSpan.textContent = subcategoryValue;
                let chartsRendered = false;
                if (result.subcategory_plot_data.prices && result.subcategory_plot_data.prices.length > 0) {
                    renderRealtimeSubcategoryPriceChart(result.subcategory_plot_data.prices, subcategoryValue);
                    chartsRendered = true;
                } else if (typeof Plotly !== 'undefined') {
                    Plotly.purge('realtimeSubcategoryPriceChart');
                }

                if (result.subcategory_plot_data.ratings && result.subcategory_plot_data.ratings.length > 0) {
                    renderRealtimeSubcategoryRatingChart(result.subcategory_plot_data.ratings, subcategoryValue);
                    chartsRendered = true;
                } else if (typeof Plotly !== 'undefined') {
                    Plotly.purge('realtimeSubcategoryRatingChart');
                }

                if(chartsRendered) {
                    realtimeSubcategoryChartContainer.classList.remove('hidden');
                } else {
                    realtimeSubcategoryChartContainer.classList.add('hidden');
                }
            } else if (realtimeSubcategoryChartContainer) {
                realtimeSubcategoryChartContainer.classList.add('hidden');
            }
        }
    } catch (error) {
        showNotification('Prediction request failed: ' + error.message, 'error');
        if (predictionResult) predictionResult.classList.remove('show');
        if (realtimeSubcategoryChartContainer) realtimeSubcategoryChartContainer.classList.add('hidden');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHtml;
    }
}

function displayPredictionResult(result) {
    const content = document.getElementById('prediction-content');
    const featuresUsedDisplay = document.getElementById('features-used-display');
    if (!content) return;

    let platformIcon = '';
    switch (result.predicted_platform.toLowerCase()) {
        case 'amazon': platformIcon = 'fab fa-amazon text-orange-400'; break;
        case 'flipkart': platformIcon = 'fas fa-shopping-bag text-blue-400'; break; // Assuming Flipkart icon color
        case 'alibaba': platformIcon = 'fas fa-globe-asia text-red-400'; break; // Example for Alibaba
        default: platformIcon = 'fas fa-store text-slate-400';
    }

    content.innerHTML = `
        <div class="text-center mb-4">
            <div class="text-4xl mb-2"><i class="${platformIcon}"></i></div>
            <h4 class="text-xl font-bold text-slate-100">${result.predicted_platform}</h4>
            <p class="text-slate-400">Confidence: ${result.confidence}%</p>
        </div>
        <div class="space-y-3">
            <h5 class="font-semibold text-slate-200">Platform Probabilities:</h5>
            ${Object.entries(result.platform_probabilities).map(([platform, prob]) => `
                <div class="platform-probability">
                    <span class="font-medium">${platform}</span>
                    <div class="probability-bar"><div class="probability-fill" style="width: ${prob}%"></div></div>
                    <span class="text-sm text-slate-400">${prob}%</span>
                </div>`).join('')}
        </div>`;

    if (featuresUsedDisplay && result.features_used) {
        let featuresHtml = '<strong class="text-slate-300">Features used for this prediction:</strong><ul class="list-disc list-inside pl-2 mt-2 text-slate-400">';
        for (const [key, value] of Object.entries(result.features_used)) {
            if (key.toLowerCase() !== 'subcategory_encoded') {
                 featuresHtml += `<li>${key}: ${typeof value === 'number' ? value.toFixed(2) : value}</li>`;
            } else {
                 featuresHtml += `<li>Subcategory: ${document.getElementById('subcategory').value} (Used as Encoded)</li>`;
            }
        }
        featuresHtml += '</ul>';
        featuresUsedDisplay.innerHTML = featuresHtml;
    } else if (featuresUsedDisplay) {
        featuresUsedDisplay.innerHTML = '';
    }
    if (predictionResult) predictionResult.classList.add('show');
}


async function handleTraining() {
    const trainingProgress = document.getElementById('training-progress');
    const startTrainingButton = document.getElementById('start-training');

    if (trainingProgress) trainingProgress.classList.remove('hidden');
    if (startTrainingButton) {
        startTrainingButton.disabled = true;
        startTrainingButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Training...';
    }

    try {
        const response = await fetch('/train_model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); // Empty body, path is in request.json in backend
        const result = await response.json();

        if (result.error) {
            showNotification(result.error, 'error');
        } else {
            showNotification('Model trained successfully!', 'success');
            const modelAccuracyEl = document.getElementById('model-accuracy');
            if (modelAccuracyEl && result.results && result.results.test_accuracy) {
                modelAccuracyEl.textContent = `${(result.results.test_accuracy * 100).toFixed(1)}%`;
            }
            // Subcategories will be loaded by checkModelStatus
            await checkModelStatus(); // This will also call loadSubcategories if model is trained
            closeTrainingModal();
        }
    } catch (error) {
        showNotification('Training request failed: ' + error.message, 'error');
    } finally {
        if (trainingProgress) trainingProgress.classList.add('hidden');
        if (startTrainingButton) {
            startTrainingButton.disabled = false;
            startTrainingButton.innerHTML = '<i class="fas fa-cogs mr-2"></i> Start Training';
        }
    }
}

function showNotification(message, type = 'success') {
    if (!notification) return;
    const notificationIcon = document.getElementById('notification-icon');
    const notificationText = document.getElementById('notification-text');
    if (!notificationIcon || !notificationText) return;

    notification.className = 'notification'; // Reset classes
    notification.classList.add(type); // Add type specific class (success, error, info)
    notificationText.textContent = message;

    if (type === 'success') {
        notificationIcon.className = 'fas fa-check-circle mr-2';
    } else if (type === 'error') {
        notificationIcon.className = 'fas fa-exclamation-circle mr-2';
    } else if (type === 'info') {
        notificationIcon.className = 'fas fa-info-circle mr-2';
    } else { // default or other types
        notificationIcon.className = 'fas fa-bell mr-2';
    }

    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

function setActiveSidebarLink(activeLinkId) {
    const navLinks = document.querySelectorAll('.sidebar nav ul li a');
    navLinks.forEach(link => {
        link.classList.remove('bg-slate-700', 'text-indigo-400', 'font-medium');
        link.classList.add('hover:bg-slate-700', 'text-slate-300', 'hover:text-slate-100');
        const icon = link.querySelector('i');
        if (icon) {
            icon.classList.remove('text-indigo-400');
            icon.classList.add('text-slate-400');
        }
    });

    const activeLink = document.getElementById(activeLinkId);
    if (activeLink) {
        activeLink.classList.add('bg-slate-700', 'text-indigo-400', 'font-medium');
        activeLink.classList.remove('hover:bg-slate-700', 'text-slate-300', 'hover:text-slate-100');
        const icon = activeLink.querySelector('i');
        if (icon) {
            icon.classList.add('text-indigo-400');
            icon.classList.remove('text-slate-400');
        }
    }
}

function showMainDashboardContent() {
    const mainContentElements = document.querySelectorAll('main > .bg-slate-800, main > .grid'); // Adjust selector as needed
    mainContentElements.forEach(el => el.classList.remove('hidden'));
    if (analyticsSection) analyticsSection.classList.add('hidden');
    setActiveSidebarLink('dashboard-nav');
}

// --- MODIFIED TO FETCH DATA ---
async function handleAnalyticsClick(e) {
    e.preventDefault();
    const mainContentElements = document.querySelectorAll('main > .bg-slate-800, main > .grid'); // Adjust selector
    mainContentElements.forEach(el => el.classList.add('hidden'));

    if (analyticsSection) {
        analyticsSection.classList.remove('hidden');
        setActiveSidebarLink('analytics-nav');
        // Fetch data and then render charts
        try {
            const response = await fetch('/api/analytics_data');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const analyticsData = await response.json();

            if (analyticsData.error) {
                showNotification(analyticsData.error, 'error');
                // Render with example/empty data if fetch fails but section is shown
                renderPlatformBarChart(null);
                renderSubcategoryPieChart(null);
                renderPriceRatingScatterChart(null);
                return;
            }

            // Pass fetched data to rendering functions
            renderPlatformBarChart(analyticsData.platform_distribution);
            renderSubcategoryPieChart(analyticsData.subcategory_usage);
            renderPriceRatingScatterChart(analyticsData.price_rating_scatter);

            // Display training results if available
            const trainingResultsContainer = document.getElementById('training-results-display'); // Assuming you have such an element
            if (trainingResultsContainer && analyticsData.training_results) {
                displayTrainingResultsInAnalytics(analyticsData.training_results);
            }


            showNotification('Analytics loaded successfully!', 'success');

        } catch (error) {
            console.error('Error loading analytics data:', error);
            showNotification('Failed to load analytics data: ' + error.message, 'error');
            // Render with example/empty data if fetch fails
            renderPlatformBarChart(null); // Pass null to use example data
            renderSubcategoryPieChart(null);
            renderPriceRatingScatterChart(null);
        }
    } else {
        showNotification('Analytics section not found in HTML.', 'error');
    }
}

// --- MODIFIED TO ACCEPT DATA ---
function renderPlatformBarChart(platformDistributionData) {
    if (typeof Plotly === 'undefined') { console.error("Plotly is not loaded"); return; }
    let platformX, platformY;

    if (platformDistributionData && platformDistributionData.platforms && platformDistributionData.platforms.length > 0) {
        platformX = platformDistributionData.platforms;
        platformY = platformDistributionData.counts;
    } else {
        // Fallback to example data if no real data is provided or on error
        console.warn("No platform distribution data, using example data for bar chart.");
        platformX = ['Amazon', 'Flipkart', 'Alibaba']; // Example from your screenshot
        platformY = [150, 70, 30]; // Example from your screenshot (approximate)
    }

    const platformDataTrace = [{
        x: platformX,
        y: platformY,
        type: 'bar',
        marker: {
            color: platformX.map(p => { // Dynamic coloring based on platform (example)
                if (p.toLowerCase() === 'amazon') return '#FF9900';
                if (p.toLowerCase() === 'flipkart') return '#2874F0';
                if (p.toLowerCase() === 'alibaba') return '#FF5A00';
                return '#64748B'; // Default color
            })
        }
    }];
    const layout = {
        font: { color: '#f8fafc' }, // White text for dark mode
        xaxis: { title: 'Platform', gridcolor: '#334155', automargin: true },
        yaxis: { title: 'Count', gridcolor: '#334155', automargin: true },
        margin: { t: 30, b: 50, l: 50, r: 20 }, // Adjusted top margin for title
        paper_bgcolor: 'rgba(0,0,0,0)', // Transparent background
        plot_bgcolor: 'rgba(0,0,0,0)',  // Transparent background
        // Removed explicit title from layout, assuming it's in HTML or handled by card header
    };
    Plotly.newPlot('platformBarChart', platformDataTrace, layout, {responsive: true});
}

// --- MODIFIED TO ACCEPT DATA AND IMPROVED LEGEND ---
function renderSubcategoryPieChart(subcategoryUsageData) {
    if (typeof Plotly === 'undefined') { console.error("Plotly is not loaded"); return; }
    let labelsToShow;
    let valuesToShow;

    if (subcategoryUsageData && subcategoryUsageData.subcategories && subcategoryUsageData.subcategories.length > 0) {
        labelsToShow = subcategoryUsageData.subcategories;
        valuesToShow = subcategoryUsageData.counts;
    } else {
        // Fallback to example data from your screenshot
        console.warn("No subcategory usage data, using example data for pie chart.");
        labelsToShow = ['Refrigerator', 'Power Banks', 'Bluetooth Speaker', 'Mobile', 'Earphones'];
        // Approximating counts that would lead to screenshot percentages if total is ~100
        const examplePercentages = [25.8, 24.7, 20.0, 13.7, 15.8];
        const exampleTotal = examplePercentages.reduce((a, b) => a + b, 0); // ~100
        valuesToShow = examplePercentages.map(p => Math.round(p)); // Use percentages as values for example
    }

    const subcategoryDataTrace = [{
        values: valuesToShow,
        labels: labelsToShow,
        type: 'pie',
        hole: .4,
        textinfo: "percent", // Show only percentage on slices
        insidetextorientation: "radial",
        hoverinfo: 'label+percent+value' // Show label, percent, and value on hover
        // pull: labelsToShow.map(() => 0.02) // Optional: slight pull for slices
    }];

    const layout = {
        font: { color: '#f8fafc' },
        height: 350, // Slightly more height for legend
        margin: { t: 20, b: 80, l: 20, r: 20 }, // Increased bottom margin for legend
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        legend: {
            orientation: "h",    // Horizontal legend
            x: 0.5,              // Centered
            xanchor: 'center',
            y: -0.2,             // Positioned below the chart
            yanchor: 'top',      // Anchored from the top of the legend box
            // traceorder: 'normal', // Use 'reversed' to match slice order if needed
            font: {
                size: 10 // Slightly smaller font for legend items if needed
            },
            // Example of how to style legend items if Plotly allows per-item styling (usually not direct)
            // It's more about global font and spacing.
            // For more control, custom HTML legend is an option.
        },
        // Removed explicit title from layout, assuming it's in HTML or handled by card header
        // annotations: [{ // Optional: Add a title in the center of the doughnut
        //   font: { size: 16, color: '#e2e8f0'},
        //   showarrow: false,
        //   text: 'Top Subcategories',
        //   x: 0.5,
        //   y: 0.5
        // }]
    };
    Plotly.newPlot('subcategoryPieChart', subcategoryDataTrace, layout, {responsive: true});
}

// --- MODIFIED TO ACCEPT DATA ---
function renderPriceRatingScatterChart(scatterPlotData) {
    if (typeof Plotly === 'undefined') { console.error("Plotly is not loaded"); return; }
    let prices, ratings;

    if (scatterPlotData && scatterPlotData.length > 0) {
        prices = scatterPlotData.map(d => d.price);
        ratings = scatterPlotData.map(d => d.rating);
    } else {
        console.warn("No price/rating data, using example data for scatter chart.");
        const count = 50; // Number of example points
        prices = Array.from({length: count}, () => getRandomInt(100, 5000));
        ratings = Array.from({length: count}, () => parseFloat((Math.random() * 4 + 1).toFixed(1))); // Ratings between 1.0 and 5.0
    }

    const trace = {
        x: prices,
        y: ratings,
        mode: 'markers',
        type: 'scatter',
        marker: {
            size: 8,
            color: '#818cf8' // Example: Indigo-300 from Tailwind
        }
    };
    const layout = {
        font: { color: '#f8fafc' },
        xaxis: {title: 'Selling Price (₹)', gridcolor: '#334155', automargin: true},
        yaxis: {title: 'Rating (1-5)', range: [0.5, 5.5], gridcolor: '#334155', automargin: true}, // Set y-axis range
        margin: { t: 30, b: 50, l: 50, r: 20 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        // Removed explicit title from layout
    };
    Plotly.newPlot('priceRatingScatter', [trace], layout, {responsive: true});
}

// --- UNCHANGED FUNCTIONS BELOW ---
function renderRealtimeSubcategoryPriceChart(prices, subcategoryName) {
    if (typeof Plotly === 'undefined' || !prices || prices.length === 0) {
        if (typeof Plotly !== 'undefined') Plotly.purge('realtimeSubcategoryPriceChart');
        return;
    }
    const trace = { x: prices, type: 'histogram', marker: { color: '#4f46e5' } }; // Example: Indigo-600
    const layout = {
        font: { color: '#f8fafc' },
        xaxis: { title: 'Selling Price (₹)', gridcolor: '#334155' },
        yaxis: { title: 'Frequency', gridcolor: '#334155' },
        margin: { t: 10, b: 40, l: 40, r: 10 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)', bargap: 0.05,
        // title: { text: `Price Distribution for ${subcategoryName}`, font: {size: 14, color: '#cbd5e1'}, y:0.98 } // Optional title
    };
    Plotly.newPlot('realtimeSubcategoryPriceChart', [trace], layout, {responsive: true});
}

function renderRealtimeSubcategoryRatingChart(ratings, subcategoryName) {
    if (typeof Plotly === 'undefined' || !ratings || ratings.length === 0) {
        if (typeof Plotly !== 'undefined') Plotly.purge('realtimeSubcategoryRatingChart');
        return;
    }
    const trace = { x: ratings, type: 'histogram', xbins: {start: 0.5, end: 5.5, size: 0.5}, marker: { color: '#10b981' } }; // Example: Emerald-500
    const layout = {
        font: { color: '#f8fafc' },
        xaxis: { title: 'Rating (1-5)', tickmode: 'array', tickvals: [1,1.5,2,2.5,3,3.5,4,4.5,5], gridcolor: '#334155'},
        yaxis: { title: 'Frequency', gridcolor: '#334155' },
        margin: { t: 10, b: 40, l: 40, r: 10 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)', bargap: 0.05,
        // title: { text: `Rating Distribution for ${subcategoryName}`, font: {size: 14, color: '#cbd5e1'}, y:0.98 } // Optional title
    };
    Plotly.newPlot('realtimeSubcategoryRatingChart', [trace], layout, {responsive: true});
}

function getRandomInt(min, max) {
    min = Math.ceil(min); max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Optional: Function to display training results in the analytics section
function displayTrainingResultsInAnalytics(trainingResults) {
    const container = document.getElementById('training-results-display'); // You'll need to add this div to your HTML
    if (!container || !trainingResults) return;

    let html = `
        <h3 class="text-lg font-semibold text-slate-100 mb-2">Last Model Training Results</h3>
        <ul class="text-slate-300 space-y-1 text-sm">
    `;
    if (trainingResults.train_accuracy !== undefined) {
        html += `<li>Train Accuracy: <span class="font-medium text-indigo-400">${(trainingResults.train_accuracy * 100).toFixed(2)}%</span></li>`;
    }
    if (trainingResults.test_accuracy !== undefined) {
        html += `<li>Test Accuracy: <span class="font-medium text-indigo-400">${(trainingResults.test_accuracy * 100).toFixed(2)}%</span></li>`;
    }
    if (trainingResults.cv_mean !== undefined && trainingResults.cv_mean > 0) { // CV mean is 0 if not run
        html += `<li>Cross-Validation Mean Accuracy: <span class="font-medium text-indigo-400">${(trainingResults.cv_mean * 100).toFixed(2)}%</span></li>`;
    }
    if (trainingResults.cv_scores && trainingResults.cv_scores.length > 0) {
        html += `<li>CV Scores: <span class="text-slate-400">${trainingResults.cv_scores.map(s => (s * 100).toFixed(1) + '%').join(', ')}</span></li>`;
    }
    html += `</ul>`;
    container.innerHTML = html;
                }
