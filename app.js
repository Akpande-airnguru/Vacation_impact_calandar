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
    console.log("DEBUG: Data has been saved to localStorage.");
}

function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('resourcePlannerData');
    if (savedData) {
        const loadedData = JSON.parse(savedData);
        appData = { ...appData, ...loadedData };
        // --- DEBUG CHECKPOINT 2 ---
        console.log("DEBUG: Data after loading from localStorage:", JSON.stringify(appData, null, 2));
    } else {
        console.log("DEBUG: No data found in localStorage on load.");
    }
}

function handleCsvImport(event) {
    const file = event.target.files[0];
    if (file) {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: (results) => {
                processGenericCsvData(results.data);
                saveDataToLocalStorage();
                alert('Data imported. The page will now reload to apply changes.');
                location.reload();
            },
            error: (err) => alert(`CSV Parsing Error: ${err.message}`)
        });
    }
}

function processGenericCsvData(data) {
    appData.customers = [];
    appData.employees = [];
    const generateId = () => Date.now() + Math.random();

    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        const fields = parseGenericFields(row);
        if (type === 'employee') {
            appData.employees.push({ id: generateId(), name: row.name, country: row.country, team: fields.team });
        } else if (type === 'customer') {
            const requirement = { teams: fields.required_team.split(',').map(t => t.trim()), min: parseInt(fields.required_employee_per_team, 10) };
            let customer = appData.customers.find(c => c.name === row.name);
            if (!customer) {
                customer = { id: generateId(), name: row.name, country: row.country, requirements: [] };
                appData.customers.push(customer);
            }
            customer.requirements.push(requirement);
        }
    });
    // --- DEBUG CHECKPOINT 1 ---
    console.log("DEBUG: Data immediately after CSV processing:", JSON.stringify(appData, null, 2));
}

// =================================================================================
// 4. CALENDAR DISPLAY & LOGIC
// =================================================================================

function generateImpactEvents(fetchInfo, leaveEvents = []) {
    // --- DEBUG CHECKPOINT 3 ---
    console.log("DEBUG: Data at the start of generateImpactEvents:", JSON.stringify(appData, null, 2));

    const impactEvents = [];
    // ... (rest of the function is the same, no changes needed inside)
    const { start, end } = fetchInfo;
    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0];
        appData.customers.forEach(customer => {
            let worstStatus = 'covered';
            const impactDetails = [];
            const statusSummary = [];
            if (!customer.requirements || customer.requirements.length === 0) {
                const titleHtml = `<span class="fc-event-title-main impact-covered">${customer.name}</span>`;
                impactEvents.push({ title: titleHtml, start: currentDateStr, allDay: true, className: 'impact-covered', description: 'No staffing requirements defined.' });
                return;
            }
            customer.requirements.forEach(req => {
                const requiredTeams = req.teams;
                const minPerTeam = req.min;
                requiredTeams.forEach(teamName => {
                    const teamStaffPool = appData.employees.filter(e => e.team === teamName);
                    const totalInTeam = teamStaffPool.length;
                    let onLeaveCount = 0;
                    const onLeaveNames = new Set();
                    teamStaffPool.forEach(emp => {
                        let isEmployeeOnLeave = false;
                        if (leaveEvents.some(leave => leave.extendedProps.type === 'vacation' && leave.extendedProps.employeeName.includes(emp.name) && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]))) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Vacation)`); }
                        else if (leaveEvents.some(leave => leave.extendedProps.type === 'companyHoliday' && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]))) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Company Holiday)`); }
                        else if (leaveEvents.some(leave => leave.extendedProps.type === 'publicHoliday' && leave.extendedProps.countryCode === emp.country.toLowerCase() && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]))) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Holiday in ${emp.country})`); }
                        if (isEmployeeOnLeave) onLeaveCount++;
                    });
                    const availableCount = totalInTeam - onLeaveCount;
                    let teamStatus = 'covered';
                    if (availableCount < minPerTeam) { teamStatus = 'critical'; } else if (availableCount === minPerTeam) { teamStatus = 'warning'; }
                    if (teamStatus === 'critical') { worstStatus = 'critical'; } else if (teamStatus === 'warning' && worstStatus !== 'critical') { worstStatus = 'warning'; }
                    let teamDetail = `<b>Team ${teamName}:</b> ${availableCount}/${totalInTeam} (Req: ${minPerTeam})`;
                    if (teamStatus === 'critical') { teamDetail += ` <strong class="text-danger">(Critical)</strong>`; statusSummary.push(`${teamName}: ${availableCount}/${minPerTeam}`); }
                    else if (teamStatus === 'warning') { teamDetail += ` <strong class="text-warning">(Warning)</strong>`; statusSummary.push(`${teamName}: ${availableCount}/${minPerTeam}`); }
                    else { teamDetail += ` (OK)`; }
                    if (availableCount < minPerTeam || onLeaveNames.size > 0) { impactDetails.push(teamDetail); if (onLeaveNames.size > 0) { impactDetails.push(`<small><i>- On Leave: ${[...onLeaveNames].join(', ')}</i></small>`); } }
                });
            });
            const statusClass = `impact-${worstStatus}`;
            let titleHtml = `<span class="fc-event-title-main ${statusClass}">${customer.name}</span>`;
            if (worstStatus !== 'covered' && statusSummary.length > 0) { titleHtml += `<span class="fc-event-status-details">${statusSummary.join(' | ')}</span>`; }
            const eventData = { title: titleHtml, start: currentDateStr, allDay: true, className: statusClass, description: impactDetails.length > 0 ? impactDetails.join('<br>') : "All teams are fully covered." };
            impactEvents.push(eventData);
        });
    }
    return impactEvents;
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
            // --- THIS IS THE CRITICAL FIX ---
            // Ensure we are creating the employee with their country
            appData.employees.push({
                id: generateId(),
                name: row.name,
                country: row.country, // Explicitly read the country column
                team: fields.team
            });
        } else if (type === 'customer') {
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
    console.log("Processed Employee and Customer Data:", appData);
}

// =================================================================================
// 4. CALENDAR DISPLAY & LOGIC
// =================================================================================

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'listWeek',
        // --- THIS IS THE NEW LINE ---
        weekends: false, // This hides Saturday and Sunday
        // --- END OF NEW LINE ---
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'listWeek,dayGridMonth'
        },
        noEventsContent: 'All customers are fully covered for this period.',
        eventContent: function(arg) {
            return { html: arg.event.title };
        },
        eventDidMount: function(info) {
            document.querySelectorAll('.tooltip').forEach(tooltip => tooltip.remove());
            new bootstrap.Tooltip(info.el, {
                title: info.event.extendedProps.description,
                placement: 'top',
                trigger: 'hover',
                container: 'body',
                html: true
            });
        }
    });
    calendar.render();
}

function generateImpactEvents(fetchInfo, leaveEvents = []) {
    const impactEvents = [];
    const { start, end } = fetchInfo;

    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0];

        appData.customers.forEach(customer => {
            // If a customer has no requirements, they are always covered.
            if (!customer.requirements || customer.requirements.length === 0) {
                const titleHtml = `<span class="fc-event-title-main impact-covered">${customer.name}</span>`;
                impactEvents.push({ title: titleHtml, start: currentDateStr, allDay: true, className: 'impact-covered', description: 'No staffing requirements defined.' });
                return; // Go to the next customer
            }
            
            // --- THIS IS THE NEW, CORRECT LOGIC ENGINE ---
            // Process each requirement for the customer (usually just one in your model)
            customer.requirements.forEach(req => {
                const requiredTeams = req.teams; // The pool of teams, e.g., ['product', 'fenix', 'rudras']
                const requiredCount = req.min;   // The number of people required from that pool, e.g., 1 or 2

                // 1. Find all employees who belong to any of the required teams.
                const staffPool = appData.employees.filter(e => requiredTeams.includes(e.team));
                const totalInPool = staffPool.length;

                // 2. Determine how many from that pool are actually on leave today.
                let onLeaveCount = 0;
                const onLeaveNames = new Set();
                
                staffPool.forEach(emp => {
                    let isEmployeeOnLeave = false;
                    // Check for personal vacation
                    if (leaveEvents.some(leave => leave.extendedProps.type === 'vacation' && leave.extendedProps.employeeName.includes(emp.name) && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]))) {
                        isEmployeeOnLeave = true;
                        onLeaveNames.add(`${emp.name} (Vacation)`);
                    }
                    // Check for a company-wide holiday
                    else if (leaveEvents.some(leave => leave.extendedProps.type === 'companyHoliday' && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]))) {
                        isEmployeeOnLeave = true;
                        onLeaveNames.add(`${emp.name} (Company Holiday)`);
                    }
                    // Check for a public holiday in the employee's country
                    else if (leaveEvents.some(leave => leave.extendedProps.type === 'publicHoliday' && leave.extendedProps.countryCode === emp.country.toLowerCase() && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]))) {
                        isEmployeeOnLeave = true;
                        onLeaveNames.add(`${emp.name} (Holiday in ${emp.country})`);
                    }

                    if(isEmployeeOnLeave) {
                        onLeaveCount++;
                    }
                });

                // 3. Calculate the number of available staff and determine the status.
                const availableCount = totalInPool - onLeaveCount;
                let status = 'covered';
                if (availableCount < requiredCount) {
                    status = 'critical';
                } else if (availableCount === requiredCount) {
                    status = 'warning';
                }
                
                // 4. Build the event content based on the status.
                const statusClass = `impact-${status}`;
                let titleHtml = `<span class="fc-event-title-main ${statusClass}">${customer.name}</span>`;
                let description = `Pool of ${requiredTeams.join(', ')}: <br><b>${availableCount} available</b> of ${totalInPool} total. <br><b>${requiredCount} required.</b>`;
                
                if (status !== 'covered') {
                    titleHtml += `<span class="fc-event-status-details">${availableCount}/${requiredCount} Available</span>`;
                }

                if (onLeaveNames.size > 0) {
                    description += `<hr class="my-2"><small><i>On Leave: ${[...onLeaveNames].join(', ')}</i></small>`;
                }

                const eventData = {
                    title: titleHtml,
                    start: currentDateStr,
                    allDay: true,
                    className: statusClass,
                    description: description
                };
                impactEvents.push(eventData);
            });
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
    if (gapi.client.getToken() === null) return [];
    const { startStr, endStr } = fetchInfo;
    const promises = [];

    // 1. Fetch from user's selected "Vacation" calendar
    if (vacationCalendarId) {
        promises.push(
            gapi.client.calendar.events.list({ calendarId: vacationCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' })
            .then(response => ({ response, type: 'vacation' }))
        );
    }
    // 2. Fetch from user's selected "Official Holiday" calendar (these are company-wide)
    if (holidayCalendarId) {
        promises.push(
            gapi.client.calendar.events.list({ calendarId: holidayCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' })
            .then(response => ({ response, type: 'companyHoliday' }))
        );
    }
    
    // 3. Fetch public holidays for each unique EMPLOYEE country
    const employeeCountries = [...new Set(appData.employees.map(e => e.country.toLowerCase()))];
    employeeCountries.forEach(code => {
        const googleCountryCode = mapCountryCode(code);
        if (googleCountryCode) {
            promises.push(
                gapi.client.calendar.events.list({ calendarId: `en.${googleCountryCode}#holiday@group.v.calendar.google.com`, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' })
                .then(response => ({ response, type: 'publicHoliday', countryCode: code })) // Tag with country
                .catch(error => ({ error, countryCode: code }))
            );
        }
    });

    const results = await Promise.allSettled(promises);
    let allEvents = [];
    results.forEach(result => {
        if (result.status === 'fulfilled') {
            const { response, type, countryCode } = result.value;
            const events = response.result.items || [];
            
            const mappedEvents = events.map(event => ({
                title: event.summary, start: event.start.date || event.start.dateTime, end: event.end.date || event.end.dateTime,
                allDay: !!event.start.date, display: 'background', className: 'google-event',
                extendedProps: {
                    employeeName: type === 'vacation' ? (event.summary.split(':')[1]?.trim() || event.summary) : null,
                    type: type, // 'vacation', 'companyHoliday', or 'publicHoliday'
                    countryCode: countryCode, // Will be undefined for vacation/company holidays
                    description: event.summary
                }
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
