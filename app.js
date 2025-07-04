// app.js

// =================================================================================
// 1. APPLICATION SETUP & STATE MANAGEMENT
// =================================================================================

// Global state object to hold all application data
let appData = {
    customers: [], // { id, name, country, minEmployees }
    employees: [], // { id, name, team }
    assignments: [], // { employeeId, customerId }
    // Note: Leave data is not stored in appData but fetched live or imported
};

// Global reference to the FullCalendar instance
let calendar;

// Google API Configuration - REPLACE WITH YOUR CREDENTIALS
const GOOGLE_API_KEY = 'YOUR_API_KEY';
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Main function to initialize the application.
 */
function initializeApp() {
    console.log("Initializing App...");
    loadDataFromLocalStorage();
    setupEventListeners();
    renderManagementTables();
    initializeCalendar();
    // Start the Google API loading process
    gapi.load('client', initializeGapiClient);
}

// =================================================================================
// 2. DATA PERSISTENCE (LocalStorage)
// =================================================================================

/**
 * Saves the current state of appData to the browser's localStorage.
 */
function saveDataToLocalStorage() {
    localStorage.setItem('resourcePlannerData', JSON.stringify(appData));
    console.log("Data saved to localStorage.");
}

/**
 * Loads data from localStorage into the global appData object.
 */
function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('resourcePlannerData');
    if (savedData) {
        appData = JSON.parse(savedData);
        console.log("Data loaded from localStorage.");
    } else {
        console.log("No saved data found. Using default empty state.");
    }
}

// =================================================================================
// 3. UI & EVENT LISTENERS
// =================================================================================

/**
 * Sets up all the event listeners for the application's UI.
 */
function setupEventListeners() {
    // Bulk Import
    document.getElementById('csv-import').addEventListener('change', handleCsvImport);

    // Google Calendar Buttons
    document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
    document.getElementById('signout_button').addEventListener('click', handleSignoutClick);
    
    // Manual Data Entry (Example for adding a customer)
    // In a real app, you'd have forms for this. We'll add a simple button.
    const addCustomerBtn = document.createElement('button');
    addCustomerBtn.className = 'btn btn-success mt-2';
    addCustomerBtn.textContent = 'Add Sample Customer';
    addCustomerBtn.onclick = () => {
        const customerName = prompt("Enter customer name:", "Customer Delta");
        const minEmployees = parseInt(prompt("Minimum employees required:", "2"), 10);
        if (customerName && !isNaN(minEmployees)) {
            addCustomer(customerName, "USA", minEmployees);
        }
    };
    // This is a simple way to add a form without cluttering the HTML
    const dataFormsDiv = document.getElementById('data-input-forms');
    dataFormsDiv.innerHTML = `
        <div class="card"><div class="card-body">
            <h5 class="card-title">Manual Entry</h5>
            <p>Add individual records. Refresh the page after making changes to see calendar updates.</p>
        </div></div>
    `;
    dataFormsDiv.querySelector('.card-body').appendChild(addCustomerBtn);
}

/**
 * Renders the data from appData into HTML tables for management.
 */
function renderManagementTables() {
    // Example: Render a list of customers for visibility
    const customerList = appData.customers.map(c => `<li>${c.name} (Req: ${c.minEmployees})</li>`).join('');
    const dataFormsDiv = document.getElementById('data-input-forms');
    let listDiv = dataFormsDiv.querySelector('.customer-list');
    if (!listDiv) {
        listDiv = document.createElement('div');
        listDiv.className = 'customer-list mt-3';
        dataFormsDiv.querySelector('.card-body').appendChild(listDiv);
    }
    listDiv.innerHTML = `<h6>Current Customers:</h6><ul>${customerList || '<li>None</li>'}</ul>`;
}


// =================================================================================
// 4. BULK CSV IMPORT (Papa Parse)
// =================================================================================

/**
 * Handles the file selection for CSV import.
 * @param {Event} event - The file input change event.
 */
function handleCsvImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            processCsvData(results.data);
            saveDataToLocalStorage();
            alert('Data imported successfully! The page will now reload.');
            location.reload(); // Easiest way to refresh the entire app state
        },
        error: (error) => {
            console.error('Error parsing CSV:', error);
            alert('Failed to import CSV. Check console for details.');
        }
    });
}

/**
 * Processes the parsed CSV data and populates the appData object.
 * @param {Array<Object>} data - The array of row objects from Papa Parse.
 */
function processCsvData(data) {
    // Clear existing data for a clean import
    appData = { customers: [], employees: [], assignments: [] };

    data.forEach(row => {
        const type = row.type?.toLowerCase();
        // A simple but effective ID generator for this context
        const generateId = () => Date.now() + Math.random();

        try {
            switch (type) {
                case 'customer':
                    appData.customers.push({
                        id: generateId(),
                        name: row.name,
                        country: row.detail1,
                        minEmployees: parseInt(row.detail2, 10)
                    });
                    break;
                case 'employee':
                    appData.employees.push({
                        id: generateId(),
                        name: row.name,
                        team: row.detail1
                    });
                    break;
                case 'assignment':
                    const employee = appData.employees.find(e => e.name === row.name);
                    const customer = appData.customers.find(c => c.name === row.detail1);
                    if (employee && customer) {
                        appData.assignments.push({ employeeId: employee.id, customerId: customer.id });
                    } else {
                        console.warn(`Could not create assignment for ${row.name} -> ${row.detail1}. Employee or Customer not found.`);
                    }
                    break;
                default:
                    console.warn(`Unknown type in CSV row: '${type}'`);
            }
        } catch (e) {
            console.error("Error processing CSV row:", row, e);
        }
    });
}

// =================================================================================
// 5. CALENDAR DISPLAY & LOGIC (FullCalendar)
// =================================================================================

/**
 * Initializes the FullCalendar instance.
 */
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        // Fetch events dynamically when the view changes
        events: fetchCalendarEvents,
        eventDidMount: function(info) {
            // Add a tooltip to show more details
            new bootstrap.Tooltip(info.el, {
                title: info.event.extendedProps.description,
                placement: 'top',
                trigger: 'hover',
                container: 'body'
            });
        }
    });
    calendar.render();
}

/**
 * The core logic engine. Fetches all necessary data and returns events for FullCalendar.
 * This function is called by FullCalendar whenever it needs event data.
 * @param {Object} fetchInfo - Information about the date range FullCalendar needs.
 * @param {Function} successCallback - Callback to pass the generated events to.
 * @param {Function} failureCallback - Callback for errors.
 */
async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const startDate = fetchInfo.startStr;
        const endDate = fetchInfo.endStr;
        console.log(`Fetching events for range: ${startDate} to ${endDate}`);
        
        // 1. Fetch leave data from Google Calendar
        const googleLeaveEvents = await fetchGoogleCalendarData(startDate, endDate);
        
        // 2. Process all data and generate impact events
        const impactEvents = generateImpactEvents(fetchInfo, googleLeaveEvents);
        
        // 3. Combine impact events with leave events for a complete view
        const allEvents = [...impactEvents, ...googleLeaveEvents];
        
        successCallback(allEvents);

    } catch (error) {
        console.error("Failed to fetch or process calendar events:", error);
        failureCallback(error);
    }
}

/**
 * Calculates staffing levels and generates impact events.
 * @param {Object} fetchInfo - The date range info from FullCalendar.
 * @param {Array} leaveEvents - An array of vacation/holiday events.
 * @returns {Array} An array of FullCalendar event objects representing impacts.
 */
function generateImpactEvents(fetchInfo, leaveEvents = []) {
    const impactEvents = [];
    const { start, end } = fetchInfo;

    // Iterate day by day through the current calendar view
    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0]; // Format: YYYY-MM-DD

        appData.customers.forEach(customer => {
            const assignedEmployees = appData.assignments
                .filter(a => a.customerId === customer.id)
                .map(a => appData.employees.find(e => e.id === a.employeeId))
                .filter(Boolean); // Filter out any undefined employees

            const totalAssigned = assignedEmployees.length;
            if (totalAssigned === 0) return; // Skip customers with no assigned staff

            const employeesOnLeave = new Set();
            assignedEmployees.forEach(emp => {
                const isOnLeave = leaveEvents.some(leave => 
                    leave.extendedProps.employeeName === emp.name &&
                    currentDateStr >= leave.start &&
                    currentDateStr < (leave.end || leave.start) // Handle all-day events correctly
                );
                if (isOnLeave) {
                    employeesOnLeave.add(emp.name);
                }
            });

            const availableStaff = totalAssigned - employeesOnLeave.size;
            
            // Create event if staffing is at or below minimum
            if (availableStaff < customer.minEmployees) {
                impactEvents.push({
                    title: `${customer.name}: ${availableStaff}/${totalAssigned} Staff`,
                    start: currentDateStr,
                    allDay: true,
                    className: 'impact-critical',
                    description: `CRITICAL: Below minimum of ${customer.minEmployees}. Staff on leave: ${[...employeesOnLeave].join(', ') || 'None'}.`
                });
            } else if (availableStaff === customer.minEmployees) {
                 impactEvents.push({
                    title: `${customer.name}: ${availableStaff}/${totalAssigned} Staff`,
                    start: currentDateStr,
                    allDay: true,
                    className: 'impact-warning',
                    description: `WARNING: At minimum of ${customer.minEmployees}. Staff on leave: ${[...employeesOnLeave].join(', ') || 'None'}.`
                });
            }
        });
    }
    return impactEvents;
}


// =================================================================================
// 6. GOOGLE CALENDAR API INTEGRATION
// =================================================================================

/**
 * Callback after the GAPI client library has loaded.
 */
async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;
        maybeEnableButtons();
    } catch (e) {
        console.error("Error initializing GAPI client:", e);
    }
}

/**
 * Callback after the Google Identity Services (GIS) library has loaded.
 * This is called from the script tag in index.html: <script ... onload="gisLoaded()"></script>
 */
window.gisLoaded = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: '', // Will be set dynamically
    });
    gisInited = true;
    maybeEnableButtons();
};

/**
 * Enables auth buttons once both GAPI and GIS libraries are loaded.
 */
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('authorize_button').innerText = 'Refresh Connection';
        // Refresh calendar to fetch new data
        calendar.refetchEvents();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('signout_button').style.display = 'none';
        document.getElementById('authorize_button').innerText = 'Connect Google Calendar';
        // Refresh calendar to clear Google events
        calendar.refetchEvents();
    }
}

/**
 * Fetches events from the user's primary Google Calendar.
 * @param {string} timeMin - The start of the date range in ISO format.
 * @param {string} timeMax - The end of the date range in ISO format.
 * @returns {Promise<Array>} A promise that resolves to an array of FullCalendar event objects.
 */
async function fetchGoogleCalendarData(timeMin, timeMax) {
    if (gapi.client.getToken() === null) {
        // Not signed in, return no events
        return [];
    }
    
    try {
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary', // Can be changed to other calendar IDs
            'timeMin': timeMin,
            'timeMax': timeMax,
            'showDeleted': false,
            'singleEvents': true,
            'orderBy': 'startTime'
        });

        const events = response.result.items;
        // Map Google Calendar events to FullCalendar event format
        return events.map(event => {
            // Simple logic to parse employee name from event title, e.g., "Vacation: Alice"
            const titleParts = event.summary.split(':');
            const employeeName = titleParts.length > 1 ? titleParts[1].trim() : "Unknown";
            
            return {
                title: `🗓️ ${event.summary}`,
                start: event.start.date || event.start.dateTime,
                end: event.end.date || event.end.dateTime,
                allDay: !!event.start.date,
                className: 'google-event',
                extendedProps: {
                    employeeName: employeeName, // Used by the impact logic
                    description: event.description || 'No description.'
                }
            };
        });
    } catch (err) {
        console.error("Error fetching Google Calendar events:", err);
        // Optionally, inform the user
        // alert("Could not fetch Google Calendar data. You may need to sign in again.");
        return []; // Return empty array on failure
    }
}

// =================================================================================
// 7. HELPER FUNCTIONS
// =================================================================================

/**
 * A helper to add a customer and refresh the UI.
 * @param {string} name 
 * @param {string} country 
 * @param {number} minEmployees 
 */
function addCustomer(name, country, minEmployees) {
    appData.customers.push({
        id: Date.now() + Math.random(),
        name,
        country,
        minEmployees
    });
    saveDataToLocalStorage();
    renderManagementTables(); // Update the list
    calendar.refetchEvents(); // Re-calculate impacts
    alert(`${name} added!`);
}
