// app.js

// =================================================================================
// 1. APPLICATION SETUP & STATE MANAGEMENT
// =================================================================================

// Global state object to hold all application data
let appData = {
    customers: [], // { id, name, country, minEmployees }
    employees: [], // { id, name, team }
    // Note: Leave data is not stored in appData but fetched live or imported
};

// Global reference to the FullCalendar instance
let calendar;

// Google API Configuration - REPLACE WITH YOUR CREDENTIALS
const GOOGLE_API_KEY = 'AIzaSyBIeWsrskXU8zgPEmRQMLuds3_kz8F1ZiI';
const GOOGLE_CLIENT_ID = '612439385835-qmadllj5nouns0aqdrt4tvvjt9htg2n7.apps.googleusercontent.com';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log("Initializing App...");
    loadDataFromLocalStorage();
    setupEventListeners();
    renderManagementTables();
    initializeCalendar();
    gapi.load('client', initializeGapiClient);
}


// =================================================================================
// 2. DATA PERSISTENCE & UI (Largely Unchanged)
// =================================================================================

function saveDataToLocalStorage() {
    localStorage.setItem('resourcePlannerData', JSON.stringify(appData));
    console.log("Data saved to localStorage.");
}

function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('resourcePlannerData');
    if (savedData) {
        appData = JSON.parse(savedData);
        console.log("Data loaded from localStorage.");
    }
}

function setupEventListeners() {
    document.getElementById('csv-import').addEventListener('change', handleCsvImport);
    document.getElementById('download-template-btn').addEventListener('click', downloadCsvTemplate);
    document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
    document.getElementById('signout_button').addEventListener('click', handleSignoutClick);
}

function renderManagementTables() {
    const customerList = appData.customers.map(c => {
        const reqs = c.requirements.map(r => `${r.team}: ${r.min}`).join(', ');
        return `<li>${c.name} (${c.country}) - Req: ${reqs}</li>`;
    }).join('');
    
    const dataFormsDiv = document.getElementById('data-input-forms');
    let listDiv = dataFormsDiv.querySelector('.customer-list');
    if (!listDiv) {
        listDiv = document.createElement('div');
        listDiv.className = 'customer-list mt-3';
        dataFormsDiv.innerHTML = `
            <div class="card border-0"><div class="card-body p-0">
                <h6>Current Customers:</h6>
                <ul class="list-unstyled">${customerList || '<li>None loaded</li>'}</ul>
            </div></div>
        `;
        dataFormsDiv.appendChild(listDiv);
    } else {
        listDiv.querySelector('ul').innerHTML = customerList || '<li>None loaded</li>';
    }
}

// =================================================================================
// 3. BULK CSV IMPORT & EXPORT (Updated for New Format)
// =================================================================================

/**
 * - NEW: Provides the advanced CSV template for download.
 */
function downloadCsvTemplate(event) {
    event.preventDefault();

    const csvContent = [
        "type,name,country,required_employee_per_team,required_team",
        "customer,Heron,AUH,1,Support Team",
        "customer,Heron,AUH,2,Dev Team",
        "customer,Hawk,QAR,3,Support Team, Dev Team",
        "customer,Goldcrest,POL,3,Support Team, Dev Team",
        "employee,Akshay,Support Team,,",
        "employee,Bob,Support Team,,",
        "employee,Carol,Dev Team,,"
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "advanced_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleCsvImport(event) {
    const file = event.target.files[0];
    if (file) {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                processAdvancedCsvData(results.data);
                saveDataToLocalStorage();
                alert('Data imported successfully! The page will now reload.');
                location.reload();
            },
            error: (err) => alert(`CSV Parsing Error: ${err.message}`)
        });
    }
}

/**
 * - REWRITTEN: Processes the new, more complex CSV format.
 */
function processAdvancedCsvData(data) {
    // Reset data stores
    appData = { customers: [], employees: [] };
    const generateId = () => Date.now() + Math.random();

    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        if (type === 'employee') {
            appData.employees.push({
                id: generateId(),
                name: row.name,
                team: row.country // The 'country' column is used for 'team' in the employee row
            });
        } else if (type === 'customer') {
            const teams = row.required_team.split(',').map(t => t.trim()).filter(Boolean);
            const requiredCount = parseInt(row.required_employee_per_team, 10);
            if (teams.length === 0 || isNaN(requiredCount)) return;

            // Find if customer already exists to aggregate requirements
            let customer = appData.customers.find(c => c.name === row.name);
            if (!customer) {
                // If not, create a new customer entry
                customer = {
                    id: generateId(),
                    name: row.name,
                    country: row.country,
                    requirements: []
                };
                appData.customers.push(customer);
            }
            
            // Add the requirement(s) from this row to the customer
            teams.forEach(teamName => {
                customer.requirements.push({
                    team: teamName,
                    min: requiredCount
                });
            });
        }
    });
    console.log("Processed App Data:", appData);
}

// =================================================================================
// 4. CALENDAR DISPLAY & CORE LOGIC (Rewritten Engine)
// =================================================================================

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        events: fetchCalendarEvents,
        eventDidMount: function(info) {
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
 * - REWRITTEN: The core calculation engine. Now checks per team.
 */
function generateImpactEvents(fetchInfo, leaveEvents = []) {
    const impactEvents = [];
    const { start, end } = fetchInfo;

    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0];

        appData.customers.forEach(customer => {
            let highestImpact = 'ok'; // 'ok', 'warning', 'critical'
            const impactDetails = [];

            customer.requirements.forEach(req => {
                const { team, min } = req;
                
                // Get all employees for the required team
                const teamMembers = appData.employees.filter(e => e.team === team);
                const totalTeamMembers = teamMembers.length;

                // Find which of them are on leave today
                const membersOnLeave = teamMembers.filter(emp => 
                    leaveEvents.some(leave =>
                        (leave.extendedProps.employeeName === emp.name || leave.extendedProps.isHoliday) &&
                        currentDateStr >= leave.start &&
                        currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0])
                    )
                );

                const availableStaff = totalTeamMembers - membersOnLeave.length;

                if (availableStaff < min) {
                    highestImpact = 'critical';
                    impactDetails.push(`${team}: ${availableStaff}/${min} (Critical)`);
                } else if (availableStaff === min && highestImpact !== 'critical') {
                    highestImpact = 'warning';
                    impactDetails.push(`${team}: ${availableStaff}/${min} (Warning)`);
                } else {
                    impactDetails.push(`${team}: ${availableStaff}/${min} (OK)`);
                }
            });

            // Create a single event for the customer summarizing the day's impact
            if (highestImpact === 'critical') {
                impactEvents.push({
                    title: `${customer.name}: Understaffed`,
                    start: currentDateStr, allDay: true, className: 'impact-critical',
                    description: impactDetails.join('<br>')
                });
            } else if (highestImpact === 'warning') {
                impactEvents.push({
                    title: `${customer.name}: At Risk`,
                    start: currentDateStr, allDay: true, className: 'impact-warning',
                    description: impactDetails.join('<br>')
                });
            }
        });
    }
    return impactEvents;
}


// =================================================================================
// 5. GOOGLE CALENDAR API INTEGRATION (Updated for Holidays)
// =================================================================================

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const googleLeaveEvents = await fetchGoogleCalendarData(fetchInfo);
        const impactEvents = generateImpactEvents(fetchInfo, googleLeaveEvents);
        successCallback([...impactEvents, ...googleLeaveEvents]);
    } catch (error) {
        console.error("Failed to fetch or process calendar events:", error);
        failureCallback(error);
    }
}

/**
 * - UPDATED: Fetches personal leave AND public holidays for all customer countries.
 */
async function fetchGoogleCalendarData(fetchInfo) {
    if (gapi.client.getToken() === null) return [];

    const { startStr, endStr } = fetchInfo;
    const promises = [];

    // 1. Fetch from user's primary calendar (vacations, personal leave)
    promises.push(gapi.client.calendar.events.list({
        'calendarId': 'primary',
        'timeMin': startStr, 'timeMax': endStr,
        'singleEvents': true, 'orderBy': 'startTime'
    }));

    // 2. Fetch public holidays for each unique customer country
    const countryCodes = [...new Set(appData.customers.map(c => c.country))];
    countryCodes.forEach(code => {
        // Google holiday calendar ID format is `en.{country_code}#holiday@group.v.calendar.google.com`
        // We need to map our codes (e.g., 'AUH'->'ae', 'USA'->'usa')
        const googleCountryCode = mapCountryCode(code.toLowerCase());
        if (googleCountryCode) {
            promises.push(gapi.client.calendar.events.list({
                'calendarId': `en.${googleCountryCode}#holiday@group.v.calendar.google.com`,
                'timeMin': startStr, 'timeMax': endStr,
                'singleEvents': true, 'orderBy': 'startTime'
            }));
        }
    });

    // Run all fetches in parallel
    const responses = await Promise.all(promises);
    let allEvents = [];
    
    responses.forEach((response, index) => {
        const events = response.result.items;
        const isHolidayCalendar = index > 0; // The first promise is the primary calendar

        const mappedEvents = events.map(event => {
            const titleParts = event.summary.split(':');
            const employeeName = isHolidayCalendar ? null : (titleParts.length > 1 ? titleParts[1].trim() : event.summary);
            
            return {
                title: `🗓️ ${event.summary}`,
                start: event.start.date || event.start.dateTime,
                end: event.end.date || event.end.dateTime,
                allDay: !!event.start.date,
                className: isHolidayCalendar ? 'google-event' : 'google-event', // Style them the same for now
                display: 'background', // Render holidays as background events
                extendedProps: { employeeName, isHoliday: isHolidayCalendar, description: event.description || 'No description.' }
            };
        });
        allEvents = allEvents.concat(mappedEvents);
    });

    return allEvents;
}

/**
 * Simple helper to map your country codes to Google's format.
 * Add more mappings as needed.
 */
function mapCountryCode(code) {
    const map = {
        'usa': 'usa', 'pol': 'polish', 'auh': 'ae', // AUH -> United Arab Emirates
        'qar': 'qatari', 'bru': 'belgian', 'spa': 'spain'
    };
    return map[code];
}

// All other Google Auth functions (gisLoaded, handleAuthClick, etc.) remain the same
// Paste the rest of the functions from the previous version here.

window.gisLoaded = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableButtons();
};

async function initializeGapiClient() {
    try {
        await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
        gapiInited = true;
        maybeEnableButtons();
    } catch (e) {
        console.error("Error initializing GAPI client:", e);
    }
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error) throw (resp);
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('authorize_button').innerText = 'Refresh Connection';
        calendar.refetchEvents();
    };
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('signout_button').style.display = 'none';
        document.getElementById('authorize_button').innerText = 'Connect Google Calendar';
        calendar.refetchEvents();
    }
}
