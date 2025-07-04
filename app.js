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
// 2. DATA PERSISTENCE & UI (renderManagementTables updated)
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

// UPDATED to show assigned employees
function renderManagementTables() {
    const customerList = appData.customers.map(c => {
        const reqs = c.requirements.map(r => `${r.team}: ${r.min}`).join(', ');
        const assignedEmps = appData.assignments
            .filter(a => a.customerId === c.id)
            .map(a => appData.employees.find(e => e.id === a.employeeId)?.name)
            .filter(Boolean)
            .join(', ');
        
        return `<li>
                    <strong>${c.name} (${c.country})</strong><br>
                    <small>Req: ${reqs || 'None'}</small><br>
                    <small>Assigned: ${assignedEmps || 'None'}</small>
                </li>`;
    }).join('');
    
    const dataFormsDiv = document.getElementById('data-input-forms');
    let listDiv = dataFormsDiv.querySelector('.customer-list');
    if (!listDiv) {
        listDiv = document.createElement('div');
        listDiv.className = 'customer-list mt-3';
        dataFormsDiv.innerHTML = `<div class="card border-0"><div class="card-body p-0"><h6>Current Setup:</h6><ul class="list-unstyled">${customerList || '<li>None loaded</li>'}</ul></div></div>`;
        dataFormsDiv.appendChild(listDiv);
    } else {
        listDiv.querySelector('ul').innerHTML = customerList || '<li>None loaded</li>';
    }
}

// =================================================================================
// 3. BULK CSV IMPORT & EXPORT (Updated for New Format)
// =================================================================================

// UPDATED to new template format
function downloadCsvTemplate(event) {
    event.preventDefault();

    const csvContent = [
        "type,name,detail1,detail2,detail3",
        "customer,Heron,AUH,1,Support Team",
        "customer,Heron,AUH,2,Dev Team",
        "customer,Hawk,QAR,3,Support Team",
        "employee,Akshay,Support Team,,",
        "employee,Bob,Dev Team,,",
        "employee,Carol,Dev Team,,",
        "assignment,Akshay,Heron,,",
        "assignment,Bob,Heron,,",
        "assignment,Carol,Heron,,",
        "assignment,Akshay,Hawk,,"
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "final_import_template.csv");
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
                processAccurateCsvData(results.data);
                saveDataToLocalStorage();
                alert('Data imported successfully! The page will now reload.');
                location.reload();
            },
            error: (err) => alert(`CSV Parsing Error: ${err.message}`)
        });
    }
}

// REWRITTEN to handle assignments
function processAccurateCsvData(data) {
    appData = { customers: [], employees: [], assignments: [] };
    const generateId = () => Date.now() + Math.random();

    // First pass: create all employees and customers
    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        if (type === 'employee') {
            if (!appData.employees.some(e => e.name === row.name)) {
                appData.employees.push({ id: generateId(), name: row.name, team: row.detail1 });
            }
        } else if (type === 'customer') {
            if (!appData.customers.some(c => c.name === row.name)) {
                appData.customers.push({ id: generateId(), name: row.name, country: row.detail1, requirements: [] });
            }
            // Add requirement to the customer
            const customer = appData.customers.find(c => c.name === row.name);
            customer.requirements.push({ team: row.detail3, min: parseInt(row.detail2, 10) });
        }
    });

    // Second pass: create assignments
    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        if (type === 'assignment') {
            const employee = appData.employees.find(e => e.name === row.name);
            const customer = appData.customers.find(c => c.name === row.detail1);
            if (employee && customer) {
                appData.assignments.push({ employeeId: employee.id, customerId: customer.id });
            }
        }
    });
    console.log("Processed Accurate App Data:", appData);
}

// =================================================================================
// 4. CALENDAR DISPLAY & CORE LOGIC (Rewritten Engine)
// =================================================================================

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: fetchCalendarEvents,
        eventDidMount: (info) => new bootstrap.Tooltip(info.el, { title: info.event.extendedProps.description, placement: 'top', trigger: 'hover', container: 'body', html: true })
    });
    calendar.render();
}

// REWRITTEN with accurate logic
function generateImpactEvents(fetchInfo, leaveEvents = []) {
    const impactEvents = [];
    const { start, end } = fetchInfo;

    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0];

        appData.customers.forEach(customer => {
            let isUnderstaffed = false;
            let isAtRisk = false;
            const impactDetails = [];
            
            // Is today a public holiday in the customer's country?
            const publicHoliday = leaveEvents.find(leave => 
                leave.extendedProps.isHoliday &&
                leave.extendedProps.countryCode === customer.country.toLowerCase() &&
                currentDateStr >= leave.start &&
                currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0])
            );

            // Get all employees SPECIFICALLY assigned to this customer
            const assignedEmployees = appData.assignments
                .filter(a => a.customerId === customer.id)
                .map(a => appData.employees.find(e => e.id === a.employeeId))
                .filter(Boolean);

            if (assignedEmployees.length === 0) continue; // Skip if no one is assigned

            // Check each requirement (e.g., '2 from Dev Team')
            customer.requirements.forEach(req => {
                const { team, min } = req;
                
                // Filter the assigned employees to just those in the required team
                const assignedTeamMembers = assignedEmployees.filter(e => e.team === team);
                const totalAssignedToTeam = assignedTeamMembers.length;
                
                let onLeaveCount = 0;
                const onLeaveNames = new Set();

                if (publicHoliday) {
                    // If it's a public holiday, ALL assigned team members are considered on leave
                    onLeaveCount = totalAssignedToTeam;
                    assignedTeamMembers.forEach(e => onLeaveNames.add(e.name + " (Holiday)"));
                } else {
                    // Otherwise, check individual vacations
                    assignedTeamMembers.forEach(emp => {
                        const onVacation = leaveEvents.some(leave =>
                            !leave.extendedProps.isHoliday &&
                            leave.extendedProps.employeeName === emp.name &&
                            currentDateStr >= leave.start &&
                            currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0])
                        );
                        if (onVacation) {
                            onLeaveCount++;
                            onLeaveNames.add(emp.name + " (Vacation)");
                        }
                    });
                }
                
                const availableStaff = totalAssignedToTeam - onLeaveCount;

                if (availableStaff < min) {
                    isUnderstaffed = true;
                    impactDetails.push(`<b>${team}:</b> ${availableStaff}/${min} <strong class="text-danger">(Critical)</strong>`);
                } else if (availableStaff === min) {
                    isAtRisk = true;
                    impactDetails.push(`<b>${team}:</b> ${availableStaff}/${min} <strong class="text-warning">(Warning)</strong>`);
                } else {
                    impactDetails.push(`<b>${team}:</b> ${availableStaff}/${min} (OK)`);
                }

                if (onLeaveNames.size > 0) {
                    impactDetails.push(`<small><i>- On Leave: ${[...onLeaveNames].join(', ')}</i></small>`);
                }
            });

            // Create a single, summarized event for the customer for that day
            const description = impactDetails.join('<br>');
            if (isUnderstaffed) {
                impactEvents.push({ title: `${customer.name}: Understaffed`, start: currentDateStr, allDay: true, className: 'impact-critical', description });
            } else if (isAtRisk) {
                impactEvents.push({ title: `${customer.name}: At Risk`, start: currentDateStr, allDay: true, className: 'impact-warning', description });
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

// UPDATED to add country code to holiday events
async function fetchGoogleCalendarData(fetchInfo) {
    if (gapi.client.getToken() === null) return [];
    const { startStr, endStr } = fetchInfo;
    const promises = [];

    promises.push(gapi.client.calendar.events.list({ 'calendarId': 'primary', 'timeMin': startStr, 'timeMax': endStr, 'singleEvents': true, 'orderBy': 'startTime' }));

    const countries = [...new Set(appData.customers.map(c => c.country.toLowerCase()))];
    countries.forEach(code => {
        const googleCountryCode = mapCountryCode(code);
        if (googleCountryCode) {
            promises.push(
                gapi.client.calendar.events.list({ 'calendarId': `en.${googleCountryCode}#holiday@group.v.calendar.google.com`, 'timeMin': startStr, 'timeMax': endStr, 'singleEvents': true, 'orderBy': 'startTime' })
                .then(response => ({ response, countryCode: code })) // Tag response with country code
                .catch(error => ({ error, countryCode: code })) // Handle errors gracefully
            );
        }
    });

    const responses = await Promise.all(promises);
    let allEvents = [];
    
    responses.forEach((result) => {
        const isPersonalCalendar = !result.countryCode;
        if (result.error) {
            console.warn(`Could not fetch holiday calendar for country: ${result.countryCode}`);
            return;
        }

        const response = isPersonalCalendar ? result : result.response;
        const events = response.result.items || [];
        
        const mappedEvents = events.map(event => {
            const employeeName = isPersonalCalendar ? (event.summary.split(':')[1]?.trim() || event.summary) : null;
            return {
                title: `🗓️ ${event.summary}`,
                start: event.start.date || event.start.dateTime,
                end: event.end.date || event.end.dateTime,
                allDay: !!event.start.date,
                display: 'background',
                extendedProps: { employeeName, isHoliday: !isPersonalCalendar, countryCode: result.countryCode, description: event.summary }
            };
        });
        allEvents = allEvents.concat(mappedEvents);
    });
    return allEvents;
}


function mapCountryCode(code) {
    const map = { 'usa': 'usa', 'pol': 'polish', 'auh': 'ae', 'qar': 'qa.qatari', 'bru': 'be.belgian', 'spa': 'spain' };
    return map[code];
}

// All other Google Auth functions (gisLoaded, handleAuthClick, etc.) remain the same
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
        calendar.refetchEvents();
    }
}
