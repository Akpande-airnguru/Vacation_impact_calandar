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
function saveDataToLocalStorage() { localStorage.setItem('resourcePlannerData', JSON.stringify(appData)); }
function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('resourcePlannerData');
    if (savedData) {
        const loadedData = JSON.parse(savedData);
        appData = { customers: [], employees: [], regions: [], settings: { vacationCalendarId: null, holidayCalendarId: null }, ...loadedData };
    }
}
function setupEventListeners() { /* ... unchanged ... */ }

function renderManagementTables() {
    const customerList = appData.customers.map(c => `<li><strong>${c.name} (${c.country})</strong><br><small>${c.requirements.map(r => `${r.teams.join(', ')}: ${r.min} required`).join('<br>')}</small></li>`).join('');
    // Reverted to not show email
    const employeeList = appData.employees.map(e => `<li>${e.name} (${e.country}) - Team: ${e.team}</li>`).join('');
    const regionList = appData.regions.map(r => `<li><strong>Region: ${r.name} (Countries: ${r.countries.join(', ')})</strong><br><small>${r.requirements.map(req => `${req.teams.join(', ')}: ${req.min} required`).join('<br>')}</small></li>`).join('');
    document.getElementById('data-input-forms').innerHTML = `<div class="card border-0"><div class="card-body p-0"><h6>Current Customers:</h6><ul class="list-unstyled">${customerList||'<li>None loaded</li>'}</ul><h6 class="mt-3">Current Regions:</h6><ul class="list-unstyled">${regionList||'<li>None loaded</li>'}</ul><h6 class="mt-3">Current Employees:</h6><ul class="list-unstyled">${employeeList||'<li>None loaded</li>'}</ul></div></div>`;
}


// =================================================================================
// 3. CSV IMPORT & EXPORT
// =================================================================================

function downloadCsvTemplate(event) {
    event.preventDefault();
    // Reverted to the simpler template without the email column
    const csvContent = [
        "type,name,country,field_1_condition,field_1_value,field_2_condition,field_2_value",
        "customer,Heron,AUH,required_team,\"product_ASIA,fenix,rudras\",required_employee_per_team,1",
        "employee,Diego Córdova,CHI,team,fenix,,",
        "region,ASIA,\"IND,QAR,AUH\",required_team,\"product_ASIA,fenix,rudras\",required_employee_per_team,1"
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "final_template.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function handleCsvImport(event) { /* ... unchanged ... */ }
function parseGenericFields(row) { /* ... unchanged ... */ }

function processGenericCsvData(data) {
    appData.customers = [];
    appData.employees = [];
    appData.regions = [];
    const generateId = () => Date.now() + Math.random();
    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        const fields = parseGenericFields(row);
        if (type === 'employee') {
            // Reverted: No longer processes the email field
            appData.employees.push({ id: generateId(), name: row.name, country: row.country, team: fields.team });
        } else if (type === 'customer' || type === 'region') {
            // ... Logic for customers and regions is unchanged ...
            const requirement = { teams: fields.required_team.split(',').map(t => t.trim()), min: parseInt(fields.required_employee_per_team, 10) };
            if (type === 'customer') {
                let customer = appData.customers.find(c => c.name === row.name);
                if (!customer) { customer = { id: generateId(), name: row.name, country: row.country, requirements: [] }; appData.customers.push(customer); }
                customer.requirements.push(requirement);
            } else { // region
                let region = appData.regions.find(r => r.name === row.name);
                if (!region) { region = { id: generateId(), name: row.name, countries: row.country.split(',').map(c => c.trim()), requirements: [] }; appData.regions.push(region); }
                region.requirements.push(requirement);
            }
        }
    });
}


// =================================================================================
// 4. CALENDAR LOGIC ENGINE
// =================================================================================

function initializeCalendar() { /* ... unchanged ... */ }

function generateImpactEvents(fetchInfo, leaveEvents = []) {
    const impactEvents = [];
    const { start, end } = fetchInfo;
    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
        const currentDateStr = day.toISOString().split('T')[0];

        const checkEntity = (entity, isRegion = false) => {
            let worstStatus = 'covered';
            const impactDetails = [];
            const statusSummary = [];
            // ... (initial logic unchanged) ...
            
            entity.requirements.forEach(req => {
                req.teams.forEach(teamName => {
                    const staffPool = isRegion 
                        ? appData.employees.filter(e => e.team === teamName && entity.countries.includes(e.country))
                        : appData.employees.filter(e => e.team === teamName);
                    
                    let onLeaveCount = 0;
                    const onLeaveNames = new Set();
                    
                    staffPool.forEach(emp => {
                        let isEmployeeOnLeave = false;
                        
                        const onHoliday = leaveEvents.find(leave =>
                            (leave.extendedProps.type === 'officialHoliday' || leave.extendedProps.type === 'publicHoliday') &&
                            leave.extendedProps.applicableCountries.includes(emp.country?.toLowerCase()) &&
                            currentDateStr >= leave.start && currentDateStr < (leave.end || (new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0])
                        );
                        
                        // NAME-BASED MATCHING LOGIC
                        const onVacation = leaveEvents.find(leave => {
                            if (leave.extendedProps.type !== 'vacation') return false;
                            
                            const employeeNameFromEvent = leave.extendedProps.employeeName;
                            if (!employeeNameFromEvent) return false;

                            // Direct, case-insensitive match between event name and employee name
                            if (employeeNameFromEvent.toLowerCase() === emp.name.toLowerCase()) {
                                // SAFETY CHECK: Warn if the name is ambiguous in the employee list
                                const matchingEmployees = appData.employees.filter(e => e.name.toLowerCase() === employeeNameFromEvent.toLowerCase());
                                if (matchingEmployees.length > 1) {
                                    console.warn(`AMBIGUOUS NAME: Vacation found for "${employeeNameFromEvent}", but there are ${matchingEmployees.length} employees with this name. Resource planning may be incorrect. Consider using unique names or adding middle initials.`);
                                }
                                return true;
                            }
                            return false;
                        });

                        if (onVacation && currentDateStr >= onVacation.start && currentDateStr < (onVacation.end || (new Date(onVacation.start).setDate(new Date(onVacation.start).getDate() + 1)).toISOString().split('T')[0])) {
                            isEmployeeOnLeave = true;
                            onLeaveNames.add(`${emp.name} (Vacation)`);
                        } else if (onHoliday) {
                            isEmployeeOnLeave = true;
                            onLeaveNames.add(`${emp.name} (Holiday in ${emp.country})`);
                        }
                        
                        if(isEmployeeOnLeave) onLeaveCount++;
                    });
                    
                    // ... (rest of the status calculation logic is unchanged) ...
                    const availableCount = staffPool.length - onLeaveCount;
                    let teamStatus = 'covered';
                    if (availableCount < req.min) teamStatus = 'critical';
                    else if (availableCount === req.min) teamStatus = 'warning';
                    if (teamStatus === 'critical') worstStatus = 'critical';
                    else if (teamStatus === 'warning' && worstStatus !== 'critical') worstStatus = 'warning';
                    let teamDetail = `<b>Team ${teamName}:</b> ${availableCount}/${staffPool.length} (Req: ${req.min})`;
                    if (teamStatus !== 'covered') { statusSummary.push(`${teamName}: ${availableCount}/${req.min}`); teamDetail += ` <strong class="text-${teamStatus === 'critical' ? 'danger' : 'warning'}">(${teamStatus.charAt(0).toUpperCase() + teamStatus.slice(1)})</strong>`; } else { teamDetail += ` (OK)`; }
                    if (availableCount < staffPool.length || onLeaveNames.size > 0) { impactDetails.push(teamDetail); if (onLeaveNames.size > 0) { impactDetails.push(`<small><i>- On Leave: ${[...onLeaveNames].join(', ')}</i></small>`); } }
                });
            });
            // ... (rest of the event creation logic is unchanged) ...
            const title = isRegion ? `[Region] ${entity.name}` : entity.name;
            const statusClass = `impact-event impact-${worstStatus}`;
            let titleHtml = `<span class="fc-event-title-main impact-${worstStatus}">${title}</span>`;
            if (statusSummary.length > 0) titleHtml += `<span class="fc-event-status-details">${statusSummary.join(' | ')}</span>`;
            const description = impactDetails.length > 0 ? impactDetails.join('<br>') : `All teams are fully covered.`;
            impactEvents.push({ title: titleHtml, start: currentDateStr, allDay: true, className: statusClass, extendedProps: { description, sortPriority: 2 } });
        };

        appData.customers.forEach(customer => checkEntity(customer, false));
        appData.regions.forEach(region => checkEntity(region, true));
    }
    return impactEvents;
}


// =================================================================================
// 5. GOOGLE CALENDAR API
// =================================================================================
async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) { /* ... unchanged ... */ }

async function fetchGoogleCalendarData(fetchInfo) {
    const { vacationCalendarId, holidayCalendarId } = appData.settings;
    if (gapi.client.getToken() === null) return [];
    const { startStr, endStr } = fetchInfo;
    const promises = [ /* ... unchanged ... */ ];
    
    // Logic to build promises list is unchanged ...
    
    const results = await Promise.allSettled(promises);
    let allEvents = [];
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            const { response, type, countryCode } = result.value;
            const events = response.result.items || [];
            
            const mappedEvents = events.map(event => {
                let cleanEventTitle = event.summary;
                let applicableCountries = [];
                // This property will hold the parsed employee name from vacation events.
                let employeeName = null;

                if (type === 'vacation') {
                    // Extracts the name from titles like "Vacations Diego Córdova" or "Vacation: Diego Córdova"
                    const nameMatch = event.summary.match(/^(?:Vacations|Vacation:?)\s+(.*)$/i);
                    if (nameMatch) {
                        employeeName = nameMatch[1].trim();
                    } else {
                        // As a fallback, use the whole summary if the pattern doesn't match
                        employeeName = event.summary.trim();
                    }
                    cleanEventTitle = employeeName; // For display, show the name
                } else { // Holiday
                    if (countryCode) { applicableCountries.push(countryCode.toLowerCase()); }
                    const titleMatch = event.summary.match(/^([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)\s*-\s*(.*)$/);
                    if (titleMatch) {
                        cleanEventTitle = titleMatch[2];
                        const countriesFromTitle = titleMatch[1].split(',').map(c => c.trim().toLowerCase());
                        applicableCountries = [...new Set([...applicableCountries, ...countriesFromTitle])];
                    }
                }

                return {
                    title: event.summary,
                    start: event.start.date || event.start.dateTime,
                    end: event.end.date || event.end.dateTime,
                    allDay: !!event.start.date,
                    className: 'leave-event',
                    extendedProps: {
                        employeeName: employeeName, // Store the parsed name
                        type: type,
                        description: cleanEventTitle,
                        applicableCountries: applicableCountries,
                        sortPriority: 1
                    }
                };
            });
            allEvents = allEvents.concat(mappedEvents);
        }
    });
    return allEvents;
}

// PARSING FIX: The mapCountryCode function is no longer needed and has been removed.
window.gisLoaded = function() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: '', }); gisInited = true; maybeEnableButtons(); };
async function initializeGapiClient() { try { await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS }); gapiInited = true; maybeEnableButtons(); if (gapi.client.getToken()) { populateCalendarSelectors(); } } catch (e) { console.error("Error initializing GAPI client:", e); } }
function maybeEnableButtons() { if (gapiInited && gisInited) { document.getElementById('authorize_button').style.visibility = 'visible'; } }
function handleAuthClick() { tokenClient.callback = async (resp) => { if (resp.error) throw (resp); document.getElementById('signout_button').style.display = 'block'; document.getElementById('authorize_button').innerText = 'Refresh Connection'; await populateCalendarSelectors(); calendar.refetchEvents(); }; if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({ prompt: 'consent' }); } else { tokenClient.requestAccessToken({ prompt: '' }); } }
function handleSignoutClick() { const token = gapi.client.getToken(); if (token !== null) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); document.getElementById('signout_button').style.display = 'none'; document.getElementById('authorize_button').innerText = 'Connect Google Calendar'; document.getElementById('calendar-selection-ui').style.display = 'none'; appData.settings.vacationCalendarId = null; appData.settings.holidayCalendarId = null; saveDataToLocalStorage(); calendar.refetchEvents(); } }
async function populateCalendarSelectors() { try { const response = await gapi.client.calendar.calendarList.list(); const calendars = response.result.items; const vacationSelect = document.getElementById('vacation-calendar-select'); const holidaySelect = document.getElementById('holiday-calendar-select'); vacationSelect.innerHTML = '<option value="">-- Select a calendar --</option>'; holidaySelect.innerHTML = '<option value="">-- Select a calendar --</option>'; calendars.forEach(cal => { const option = new Option(cal.summary, cal.id); vacationSelect.add(option.cloneNode(true)); holidaySelect.add(option); }); if (appData.settings.vacationCalendarId) { vacationSelect.value = appData.settings.vacationCalendarId; } if (appData.settings.holidayCalendarId) { holidaySelect.value = appData.settings.holidayCalendarId; } document.getElementById('calendar-selection-ui').style.display = 'block'; } catch (error) { console.error("Could not fetch user's calendar list:", error); alert("Could not load your calendar list. Please try refreshing or re-connecting."); } }
