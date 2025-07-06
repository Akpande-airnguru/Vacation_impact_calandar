// app.js

// =================================================================================
// 1. APPLICATION SETUP & STATE MANAGEMENT
// =================================================================================

// Global state object to hold all application data
let appData = {
    customers: [], // { id, name, country, minEmployees }
    employees: [], // { id, name, team }
    regions: [],   // { id, name, countries: [], requirements: [{ teams, min }] }
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
}

function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('resourcePlannerData');
    if (savedData) {
        const loadedData = JSON.parse(savedData);
        
        // Robustly load data, ensuring all keys exist.
        appData = {
            customers: [],
            employees: [],
            regions: [], 
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
    
    const regionList = appData.regions.map(r => {
        const reqs = r.requirements.map(req => `${req.teams.join(', ')}: ${req.min} required`).join('<br>');
        return `<li><strong>Region: ${r.name} (Countries: ${r.countries.join(', ')})</strong><br><small>${reqs}</small></li>`;
    }).join('');

    const dataFormsDiv = document.getElementById('data-input-forms');
    dataFormsDiv.innerHTML = `<div class="card border-0"><div class="card-body p-0">
                                <h6>Current Customers:</h6><ul class="list-unstyled">${customerList || '<li>None loaded</li>'}</ul>
                                <h6 class="mt-3">Current Regions:</h6><ul class="list-unstyled">${regionList || '<li>None loaded</li>'}</ul>
                                <h6 class="mt-3">Current Employees:</h6><ul class="list-unstyled">${employeeList || '<li>None loaded</li>'}</ul>
                              </div></div>`;
}


// =================================================================================
// 3. CSV IMPORT & EXPORT
// =================================================================================

function downloadCsvTemplate(event) {
    event.preventDefault();
    const csvContent = [
        "type,name,country,field_1_condition,field_1_value,field_2_condition,field_2_value",
        "customer,Heron,AUH,required_team,\"product_ASIA,fenix,rudras\",required_employee_per_team,1",
        "customer,Hawk,QAR,required_team,\"product_ASIA,fenix,rudras\",required_employee_per_team,2",
        "employee,Akshay,IND,team,product_ASIA,,",
        "employee,Bob,AUH,team,fenix,,",
        "employee,Carol,QAR,team,rudras,,",
        "region,ASIA,\"IND,QAR,AUH\",required_team,\"product_ASIA,fenix,rudras\",required_employee_per_team,1"
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "final_template.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
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

function parseGenericFields(row) {
    const fields = {};
    for (let i = 1; i <= 4; i++) {
        const condition = row[`field_${i}_condition`];
        const value = row[`field_${i}_value`];
        if (condition) { fields[condition] = value; }
    }
    return fields;
}

function processGenericCsvData(data) {
    // Reset data arrays, preserve settings
    appData.customers = [];
    appData.employees = [];
    appData.regions = [];

    const generateId = () => Date.now() + Math.random();

    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        const fields = parseGenericFields(row);

        if (type === 'employee') {
            appData.employees.push({
                id: generateId(),
                name: row.name,
                country: row.country,
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
        } else if (type === 'region') {
            const requirement = {
                teams: fields.required_team.split(',').map(t => t.trim()),
                min: parseInt(fields.required_employee_per_team, 10)
            };
            let region = appData.regions.find(r => r.name === row.name);
            if (!region) {
                region = { 
                    id: generateId(), 
                    name: row.name, 
                    countries: row.country.split(',').map(c => c.trim()), 
                    requirements: [] 
                };
                appData.regions.push(region);
            }
            region.requirements.push(requirement);
        }
    });
}

// =================================================================================
// 4. CALENDAR LOGIC ENGINE
// =================================================================================

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listWeek'
        },
        dayMaxEvents: true,

        eventContent: function(arg) {
            let htmlContent = '';
            
            // This function relies on extendedProps.description being correctly formatted.
            if (arg.event.extendedProps.type) {
                htmlContent = `<div class="fc-event-title">${arg.event.extendedProps.description || arg.event.title}</div>`;
            }
            else {
                if (arg.view.type === 'dayGridMonth') {
                    const mainTitleMatch = arg.event.title.match(/<span class="fc-event-title-main.*?">(.*?)<\/span>/);
                    const customerName = mainTitleMatch ? mainTitleMatch[1] : 'Event';
                    htmlContent = `<div class="fc-event-title">${customerName}</div>`;
                } else {
                    htmlContent = arg.event.title;
                }
            }
            return { html: htmlContent };
        },

        eventDidMount: function(info) {
            document.querySelectorAll('.tooltip').forEach(tooltip => tooltip.remove());
            if (info.event.extendedProps.description) {
                new bootstrap.Tooltip(info.el, {
                    title: info.event.extendedProps.description,
                    placement: 'top',
                    trigger: 'hover',
                    container: 'body',
                    html: true
                });
            }
        },
        
        listDayFormat: { month: 'long', day: 'numeric', year: 'numeric', weekday: 'long' },
        buttonText: { listWeek: 'week', dayGridMonth: 'month' },
        noEventsContent: 'All customers are fully covered for this period.',
    });
    
    calendar.setOption('events', fetchCalendarEvents);
    calendar.render();
}

function generateImpactEvents(fetchInfo, leaveEvents = []) {
    const impactEvents = [];
    const { start, end } = fetchInfo;
    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0];

        // --- 1. CUSTOMER CHECK (Existing Logic) ---
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
                        const empCountry = emp.country?.toLowerCase();
                        const onHoliday = leaveEvents.find(leave => (leave.extendedProps.type === 'officialHoliday' || leave.extendedProps.type === 'publicHoliday') && leave.extendedProps.countryCode === empCountry && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]));
                        const onVacation = leaveEvents.find(leave => leave.extendedProps.type === 'vacation' && leave.extendedProps.employeeName.includes(emp.name) && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]));
                        if (onVacation) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Vacation)`); }
                        else if (onHoliday) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Holiday in ${emp.country})`); }
                        if(isEmployeeOnLeave) onLeaveCount++;
                    });
                    const availableCount = totalInTeam - onLeaveCount;
                    let teamStatus = 'covered';
                    if (availableCount < minPerTeam) { teamStatus = 'critical'; }
                    else if (availableCount === minPerTeam) { teamStatus = 'warning'; }
                    if (teamStatus === 'critical') { worstStatus = 'critical'; }
                    else if (teamStatus === 'warning' && worstStatus !== 'critical') { worstStatus = 'warning'; }
                    let teamDetail = `<b>Team ${teamName}:</b> ${availableCount}/${totalInTeam} (Req: ${minPerTeam})`;
                    if (teamStatus === 'critical') { teamDetail += ` <strong class="text-danger">(Critical)</strong>`; statusSummary.push(`${teamName}: ${availableCount}/${minPerTeam}`); }
                    else if (teamStatus === 'warning') { teamDetail += ` <strong class="text-warning">(Warning)</strong>`; statusSummary.push(`${teamName}: ${availableCount}/${minPerTeam}`); }
                    else { teamDetail += ` (OK)`; }
                    if (availableCount < totalInTeam || onLeaveNames.size > 0) { impactDetails.push(teamDetail); if (onLeaveNames.size > 0) { impactDetails.push(`<small><i>- On Leave: ${[...onLeaveNames].join(', ')}</i></small>`); } }
                });
            });
            const statusClass = `impact-event impact-${worstStatus}`;
            let titleHtml = `<span class="fc-event-title-main impact-${worstStatus}">${customer.name}</span>`;
            if (statusSummary.length > 0) { titleHtml += `<span class="fc-event-status-details">${statusSummary.join(' | ')}</span>`; }
            const eventData = { title: titleHtml, start: currentDateStr, allDay: true, className: statusClass, description: impactDetails.length > 0 ? impactDetails.join('<br>') : "All teams are fully covered." };
            impactEvents.push(eventData);
        });

        // --- 2. REGION CHECK ---
        appData.regions.forEach(region => {
            let worstStatus = 'covered';
            const impactDetails = [];
            const statusSummary = [];
            if (!region.requirements || region.requirements.length === 0) return;

            region.requirements.forEach(req => {
                const requiredTeams = req.teams;
                const minPerTeam = req.min;
                requiredTeams.forEach(teamName => {
                    const teamStaffPool = appData.employees.filter(e => e.team === teamName && region.countries.includes(e.country));
                    const totalInTeam = teamStaffPool.length;
                    let onLeaveCount = 0;
                    const onLeaveNames = new Set();
                    teamStaffPool.forEach(emp => {
                        let isEmployeeOnLeave = false;
                        const empCountry = emp.country?.toLowerCase();
                        const onHoliday = leaveEvents.find(leave => (leave.extendedProps.type === 'officialHoliday' || leave.extendedProps.type === 'publicHoliday') && leave.extendedProps.countryCode === empCountry && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]));
                        const onVacation = leaveEvents.find(leave => leave.extendedProps.type === 'vacation' && leave.extendedProps.employeeName.includes(emp.name) && currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]));
                        if (onVacation) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Vacation)`); }
                        else if (onHoliday) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Holiday in ${emp.country})`); }
                        if (isEmployeeOnLeave) onLeaveCount++;
                    });
                    const availableCount = totalInTeam - onLeaveCount;
                    let teamStatus = 'covered';
                    if (availableCount < minPerTeam) { teamStatus = 'critical'; }
                    else if (availableCount === minPerTeam) { teamStatus = 'warning'; }
                    if (teamStatus === 'critical') { worstStatus = 'critical'; }
                    else if (teamStatus === 'warning' && worstStatus !== 'critical') { worstStatus = 'warning'; }
                    let teamDetail = `<b>Team ${teamName}:</b> ${availableCount}/${totalInTeam} (Req: ${minPerTeam})`;
                    if (teamStatus === 'critical') { teamDetail += ` <strong class="text-danger">(Critical)</strong>`; statusSummary.push(`${teamName}: ${availableCount}/${minPerTeam}`); }
                    else if (teamStatus === 'warning') { teamDetail += ` <strong class="text-warning">(Warning)</strong>`; statusSummary.push(`${teamName}: ${availableCount}/${minPerTeam}`); }
                    else { teamDetail += ` (OK)`; }
                    if (availableCount < totalInTeam || onLeaveNames.size > 0) { impactDetails.push(teamDetail); if (onLeaveNames.size > 0) { impactDetails.push(`<small><i>- On Leave: ${[...onLeaveNames].join(', ')}</i></small>`); } }
                });
            });
            const statusClass = `impact-event impact-${worstStatus}`;
            let titleHtml = `<span class="fc-event-title-main impact-${worstStatus}">[Region] ${region.name}</span>`;
            if (statusSummary.length > 0) { titleHtml += `<span class="fc-event-status-details">${statusSummary.join(' | ')}</span>`; }
            const eventData = { title: titleHtml, start: currentDateStr, allDay: true, className: statusClass, description: impactDetails.length > 0 ? impactDetails.join('<br>') : "All teams in this region are fully covered." };
            impactEvents.push(eventData);
        });

    }
    return impactEvents;
}


// =================================================================================
// 5. GOOGLE CALENDAR API
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
    if (vacationCalendarId) {
        promises.push(
            gapi.client.calendar.events.list({ calendarId: vacationCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' })
            .then(response => ({ response, type: 'vacation' }))
        );
    }
    if (holidayCalendarId) {
        promises.push(
            gapi.client.calendar.events.list({ calendarId: holidayCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' })
            .then(response => ({ response, type: 'officialHoliday' }))
        );
    }
    const employeeCountries = [...new Set(appData.employees.filter(e => e.country).map(e => e.country.toLowerCase()))];
    employeeCountries.forEach(code => {
        const googleCountryCode = mapCountryCode(code);
        if (googleCountryCode) {
            promises.push(
                gapi.client.calendar.events.list({ calendarId: `en.${googleCountryCode}#holiday@group.v.calendar.google.com`, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' })
                .then(response => ({ response, type: 'publicHoliday', countryCode: code }))
                .catch(error => ({ error, countryCode: code }))
            );
        }
    });
    const results = await Promise.allSettled(promises);
    let allEvents = [];
    results.forEach(result => {
        if (result.status === 'fulfilled' && !result.value.error) {
            const { response, type, countryCode } = result.value;
            const events = response.result.items || [];
            
            // ================== MODIFICATION START ==================
            // This entire mapping function is updated to properly format the description.
            const mappedEvents = events.map(event => {
                let eventCountry = countryCode; // Use the country from the promise by default
                let eventTitle = event.summary;
                
                // For the "Official Holiday" calendar, parse the country from the title like "CHI - Holiday Name"
                if (type === 'officialHoliday') {
                    const match = event.summary.match(/^([A-Z]{3})\s*-\s*(.*)$/);
                    if (match) {
                        eventCountry = match[1].toLowerCase(); // e.g., 'chi'
                        eventTitle = match[2];               // e.g., 'San Pedro y San Pablo'
                    }
                }

                // --- THIS IS THE KEY FIX ---
                // Create a display-ready description. For holidays, prepend the country code.
                let displayDescription = eventTitle; // Default to the parsed title
                if ((type === 'officialHoliday' || type === 'publicHoliday') && eventCountry) {
                    displayDescription = `${eventCountry.toUpperCase()} - ${eventTitle}`;
                }

                return {
                    title: event.summary, // Keep original summary for raw data
                    start: event.start.date || event.start.dateTime,
                    end: event.end.date || event.end.dateTime,
                    allDay: !!event.start.date,
                    className: 'leave-event',
                    extendedProps: {
                        employeeName: type === 'vacation' ? (event.summary.split(':')[1]?.trim() || event.summary) : null,
                        type: type,
                        countryCode: eventCountry,
                        // Use the newly formatted description for display purposes
                        description: displayDescription 
                    }
                };
            });
            // =================== MODIFICATION END ===================

            allEvents = allEvents.concat(mappedEvents);
        } else if (result.status === 'rejected') {
            console.error("Failed to fetch calendar:", result.reason);
        }
    });
    return allEvents;
}
function mapCountryCode(code) { const map = { 'usa': 'usa', 'pol': 'polish', 'auh': 'ae', 'qar': 'qa.qatari', 'bru': 'be.belgian', 'spa': 'spain', 'ind': 'indian' }; return map[code]; }
window.gisLoaded = function() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: '', }); gisInited = true; maybeEnableButtons(); };
async function initializeGapiClient() { try { await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS }); gapiInited = true; maybeEnableButtons(); if (gapi.client.getToken()) { populateCalendarSelectors(); } } catch (e) { console.error("Error initializing GAPI client:", e); } }
function maybeEnableButtons() { if (gapiInited && gisInited) { document.getElementById('authorize_button').style.visibility = 'visible'; } }
function handleAuthClick() { tokenClient.callback = async (resp) => { if (resp.error) throw (resp); document.getElementById('signout_button').style.display = 'block'; document.getElementById('authorize_button').innerText = 'Refresh Connection'; await populateCalendarSelectors(); calendar.refetchEvents(); }; if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({ prompt: 'consent' }); } else { tokenClient.requestAccessToken({ prompt: '' }); } }
function handleSignoutClick() { const token = gapi.client.getToken(); if (token !== null) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); document.getElementById('signout_button').style.display = 'none'; document.getElementById('authorize_button').innerText = 'Connect Google Calendar'; document.getElementById('calendar-selection-ui').style.display = 'none'; appData.settings.vacationCalendarId = null; appData.settings.holidayCalendarId = null; saveDataToLocalStorage(); calendar.refetchEvents(); } }
async function populateCalendarSelectors() { try { const response = await gapi.client.calendar.calendarList.list(); const calendars = response.result.items; const vacationSelect = document.getElementById('vacation-calendar-select'); const holidaySelect = document.getElementById('holiday-calendar-select'); vacationSelect.innerHTML = '<option value="">-- Select a calendar --</option>'; holidaySelect.innerHTML = '<option value="">-- Select a calendar --</option>'; calendars.forEach(cal => { const option = new Option(cal.summary, cal.id); vacationSelect.add(option.cloneNode(true)); holidaySelect.add(option); }); if (appData.settings.vacationCalendarId) { vacationSelect.value = appData.settings.vacationCalendarId; } if (appData.settings.holidayCalendarId) { holidaySelect.value = appData.settings.holidayCalendarId; } document.getElementById('calendar-selection-ui').style.display = 'block'; } catch (error) { console.error("Could not fetch user's calendar list:", error); alert("Could not load your calendar list. Please try refreshing or re-connecting."); } }
