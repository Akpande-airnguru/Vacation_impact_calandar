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
const GOOGLE_API_KEY = 'AIzaSyCXlCu4Xl4iu94TwGmtOHv_BvEUZxlwPSk';
const GOOGLE_CLIENT_ID = '612439385835-vvddjfvh151k187liqauarg6gnl0tjds.apps.googleusercontent.com';
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
// 2. DATA PERSISTENCE & UI
// =================================================================================

function saveDataToLocalStorage() {
    localStorage.setItem('resourcePlannerData', JSON.stringify(appData));
    console.log("Data saved to localStorage.");
}

function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('resourcePlannerData');
    if (savedData) {
        const loadedData = JSON.parse(savedData);
        // Use default structure to ensure new properties are not lost
        appData = {
            customers: [],
            employees: [],
            settings: { vacationCalendarId: null, holidayCalendarId: null },
            ...loadedData
        };
    }
}

function setupEventListeners() {
    document.getElementById('csv-import').addEventListener('change', handleCsvImport);
    document.getElementById('download-template-btn').addEventListener('click', downloadCsvTemplate);
    document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
    document.getElementById('signout_button').addEventListener('click', handleSignoutClick);
    document.getElementById('vacation-calendar-select').addEventListener('change', (e) => {
        appData.settings.vacationCalendarId = e.target.value;
        saveDataToLocalStorage();
        calendar.refetchEvents();
    });
    document.getElementById('holiday-calendar-select').addEventListener('change', (e) => {
        appData.settings.holidayCalendarId = e.target.value;
        saveDataToLocalStorage();
        calendar.refetchEvents();
    });
}

function renderManagementTables() {
    const customerList = appData.customers.map(c => {
        const reqs = c.requirements.map(r => `${r.teams.join(', ')}: ${r.min} required`).join('<br>');
        return `<li><strong>${c.name} (${c.country})</strong><br><small>${reqs}</small></li>`;
    }).join('');
    const employeeList = appData.employees.map(e => `<li>${e.name} (${e.country}) - Team: ${e.team}</li>`).join('');
    const dataFormsDiv = document.getElementById('data-input-forms');
    dataFormsDiv.innerHTML = `<div class="card border-0"><div class="card-body p-0">
        <h6>Current Customers:</h6><ul class="list-unstyled">${customerList || '<li>None loaded</li>'}</ul>
        <h6 class="mt-3">Current Employees:</h6><ul class="list-unstyled">${employeeList || '<li>None loaded</li>'}</ul>
    </div></div>`;
}

// =================================================================================
// 3. GENERIC CSV IMPORT & EXPORT
// =================================================================================

function downloadCsvTemplate(event) {
    event.preventDefault();
    const csvContent = ["type,name,country,field_1_condition,field_1_value,field_2_condition,field_2_value", "customer,Heron,AUH,required_team,\"product,fenix,rudras\",required_employee_per_team,1", "customer,Hawk,QAR,required_team,\"product,fenix,rudras\",required_employee_per_team,2", "employee,Akshay,IND,team,product", "employee,Bob,AUH,team,fenix", "employee,Carol,QAR,team,rudras"].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "generic_rules_template.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function handleCsvImport(event) {
    const file = event.target.files[0];
    if (file) {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: (results) => { processGenericCsvData(results.data); saveDataToLocalStorage(); alert('Data imported successfully! The page will now reload.'); location.reload(); },
            error: (err) => alert(`CSV Parsing Error: ${err.message}`)
        });
    }
}

function parseGenericFields(row) {
    const fields = {};
    for (let i = 1; i <= 4; i++) {
        const condition = row[`field_${i}_condition`];
        const value = row[`field_${i}_value`];
        if (condition) { fields[condition] = value; }
    }
    return fields;
}

// CORRECTED VERSION of this function with the missing brace
function processGenericCsvData(data) {
    // Reset the data, but keep the settings
    appData.customers = [];
    appData.employees = [];
    const generateId = () => Date.now() + Math.random();

    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        const fields = parseGenericFields(row);
        if (type === 'employee') {
            appData.employees.push({ id: generateId(), name: row.name, country: row.country, team: fields.team });
        } else if (type === 'customer') { // This else if now correctly pairs with the if
            const requirement = {
                teams: fields.required_team.split(',').map(t => t.trim()),
                min: parseInt(fields.required_employee_per_team, 10)
            };
            let customer = appData.customers.find(c => c.name === row.name);
            if (!customer) {
                customer = { id: generateId(), name: row.name, country: row.country, requirements: [] };
                appData.customers.push(customer);
            }
            customer.requirements.push(requirement);
        }
    });
    console.log("Processed Generic App Data:", appData);
}

// =================================================================================
// 4. CALENDAR DISPLAY & LOGIC
// =================================================================================

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'listWeek',
         headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'listWeek,dayGridMonth' // listWeek is now the default
        },
        noEventsContent: 'No impacted customers for this period.',
        events: fetchCalendarEvents,
        eventDidMount: (info) => new bootstrap.Tooltip(info.el, {
            title: info.event.extendedProps.description,
            placement: 'top',
            trigger: 'hover',
            container: 'body',
            html: true
        })
    });
    calendar.render();
}

function generateImpactEvents(fetchInfo, leaveEvents = []) {
    const impactEvents = [];
    const { start, end } = fetchInfo;
    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0];
        appData.customers.forEach(customer => {
            let isUnderstaffed = false;
            let isAtRisk = false;
            const impactDetails = [];
            
            // If there are no requirements, the customer is always covered.
            if (!customer.requirements || customer.requirements.length === 0) {
                impactEvents.push({
                    title: customer.name,
                    start: currentDateStr, allDay: true,
                    className: 'impact-covered',
                    description: 'No staffing requirements defined.'
                });
                return; // Go to the next customer
            }

            customer.requirements.forEach(req => {
                const { teams, min } = req;
                const potentialStaffPool = appData.employees.filter(e => teams.includes(e.team));
                const onLeaveNames = new Set();
                const availableStaffPool = potentialStaffPool.filter(emp => {
                    const onVacation = leaveEvents.some(leave => !leave.extendedProps.isHoliday && leave.extendedProps.employeeName === emp.name && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]));
                    if (onVacation) { onLeaveNames.add(`${emp.name} (Vacation)`); return false; }
                    const onPublicHoliday = leaveEvents.some(leave => leave.extendedProps.isHoliday && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]));
                    if (onPublicHoliday) { onLeaveNames.add(`${emp.name} (Holiday)`); return false; }
                    return true;
                });
                const availableCount = availableStaffPool.length;
                if (availableCount < min) {
                    isUnderstaffed = true;
                    impactDetails.push(`<b>${teams.join('/')}:</b> ${availableCount}/${min} <strong class="text-danger">(Critical)</strong>`);
                } else if (availableCount === min) {
                    isAtRisk = true;
                    impactDetails.push(`<b>${teams.join('/')}:</b> ${availableCount}/${min} <strong class="text-warning">(Warning)</strong>`);
                } else {
                    impactDetails.push(`<b>${teams.join('/')}:</b> ${availableCount}/${min} (OK)`);
                }
                if (onLeaveNames.size > 0) { impactDetails.push(`<small><i>- On Leave: ${[...onLeaveNames].join(', ')}</i></small>`); }
            });

            // THIS IS THE KEY CHANGE: We now create an event for every status.
            const description = impactDetails.join('<br>');
            if (isUnderstaffed) {
                impactEvents.push({ title: customer.name, start: currentDateStr, allDay: true, className: 'impact-critical', description });
            } else if (isAtRisk) {
                impactEvents.push({ title: customer.name, start: currentDateStr, allDay: true, className: 'impact-warning', description });
            } else {
                // Add the "Covered" event
                impactEvents.push({ title: customer.name, start: currentDateStr, allDay: true, className: 'impact-covered', description });
            }
        });
    }
    return impactEvents;
}


// =================================================================================
// 5. GOOGLE CALENDAR API INTEGRATION
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

async function fetchGoogleCalendarData(fetchInfo) {
    const { vacationCalendarId, holidayCalendarId } = appData.settings;
    if (gapi.client.getToken() === null || (!vacationCalendarId && !holidayCalendarId)) { return []; }
    const { startStr, endStr } = fetchInfo;
    const promises = [];
    if (vacationCalendarId) {
        promises.push(gapi.client.calendar.events.list({ calendarId: vacationCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'vacation' })));
    }
    if (holidayCalendarId) {
        promises.push(gapi.client.calendar.events.list({ calendarId: holidayCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'holiday' })));
    }
    const results = await Promise.allSettled(promises);
    let allEvents = [];
    results.forEach(result => {
        if (result.status === 'fulfilled') {
            const { response, type } = result.value;
            const events = response.result.items || [];
            const isHoliday = type === 'holiday';
            const mappedEvents = events.map(event => ({
                title: event.summary, start: event.start.date || event.start.dateTime, end: event.end.date || event.end.dateTime,
                allDay: !!event.start.date, display: 'background', className: 'google-event',
                extendedProps: { employeeName: isHoliday ? null : (event.summary.split(':')[1]?.trim() || event.summary), isHoliday: isHoliday, description: event.summary }
            }));
            allEvents = allEvents.concat(mappedEvents);
        } else { console.error("Failed to fetch calendar:", result.reason); }
    });
    return allEvents;
}

async function populateCalendarSelectors() {
    try {
        const response = await gapi.client.calendar.calendarList.list();
        const calendars = response.result.items;
        const vacationSelect = document.getElementById('vacation-calendar-select');
        const holidaySelect = document.getElementById('holiday-calendar-select');
        vacationSelect.innerHTML = '<option value="">-- Select a calendar --</option>';
        holidaySelect.innerHTML = '<option value="">-- Select a calendar --</option>';
        calendars.forEach(cal => {
            const option = new Option(cal.summary, cal.id);
            vacationSelect.add(option.cloneNode(true));
            holidaySelect.add(option);
        });
        if (appData.settings.vacationCalendarId) { vacationSelect.value = appData.settings.vacationCalendarId; }
        if (appData.settings.holidayCalendarId) { holidaySelect.value = appData.settings.holidayCalendarId; }
        document.getElementById('calendar-selection-ui').style.display = 'block';
    } catch (error) {
        console.error("Could not fetch user's calendar list:", error);
        alert("Could not load your calendar list. Please try refreshing or re-connecting.");
    }
}

// All Google Auth functions
window.gisLoaded = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: '', });
    gisInited = true;
    maybeEnableButtons();
};
async function initializeGapiClient() {
    try {
        await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
        gapiInited = true;
        maybeEnableButtons();
        if (gapi.client.getToken()) { populateCalendarSelectors(); }
    } catch (e) { console.error("Error initializing GAPI client:", e); }
}
function maybeEnableButtons() {
    if (gapiInited && gisInited) { document.getElementById('authorize_button').style.visibility = 'visible'; }
}
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error) throw (resp);
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('authorize_button').innerText = 'Refresh Connection';
        await populateCalendarSelectors();
        calendar.refetchEvents();
    };
    if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({ prompt: 'consent' }); }
    else { tokenClient.requestAccessToken({ prompt: '' }); }
}
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('signout_button').style.display = 'none';
        document.getElementById('authorize_button').innerText = 'Connect Google Calendar';
        document.getElementById('calendar-selection-ui').style.display = 'none';
        appData.settings.vacationCalendarId = null;
        appData.settings.holidayCalendarId = null;
        saveDataToLocalStorage();
        calendar.refetchEvents();
    }
}
