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
    const customerList = appData.customers.map(c => `<li><strong>${c.name} (${c.country})</strong><br><small>${c.requirements.map(r => `${r.teams.join(', ')}: ${r.min} required`).join('<br>')}</small></li>`).join('');
    const employeeList = appData.employees.map(e => `<li>${e.name} (${e.country}) - Team: ${e.team}</li>`).join('');
    const regionList = appData.regions.map(r => `<li><strong>Region: ${r.name} (Countries: ${r.countries.join(', ')})</strong><br><small>${r.requirements.map(req => `${req.teams.join(', ')}: ${req.min} required`).join('<br>')}</small></li>`).join('');
    document.getElementById('data-input-forms').innerHTML = `<div class="card border-0"><div class="card-body p-0"><h6>Current Customers:</h6><ul class="list-unstyled">${customerList||'<li>None loaded</li>'}</ul><h6 class="mt-3">Current Regions:</h6><ul class="list-unstyled">${regionList||'<li>None loaded</li>'}</ul><h6 class="mt-3">Current Employees:</h6><ul class="list-unstyled">${employeeList||'<li>None loaded</li>'}</ul></div></div>`;
}


// =================================================================================
// 3. CSV IMPORT & EXPORT
// =================================================================================

function downloadCsvTemplate(event) {
    event.preventDefault();
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

function handleCsvImport(event) {
    const file = event.target.files[0];
    if (file) {
        Papa.parse(file, {
            header: true, 
            skipEmptyLines: true,
            encoding: "UTF-8",
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
    appData.customers = [];
    appData.employees = [];
    appData.regions = [];
    const generateId = () => Date.now() + Math.random();
    data.forEach(row => {
        const type = row.type?.toLowerCase().trim();
        const fields = parseGenericFields(row);
        if (type === 'employee') {
            appData.employees.push({ id: generateId(), name: row.name, country: row.country, team: fields.team });
        } else if (type === 'customer' || type === 'region') {
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

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },

        // ADVANCED SORTING: Update dayMaxEvents to a function.
        // This tells FullCalendar to calculate the number of slots dynamically,
        // which is necessary when some events are pinned open with 'display: block'.
        dayMaxEvents: function(arg) {
            // This is a reasonable starting point. It might need tweaking
            // depending on your average number of critical events per day.
            // Returning 'true' would revert to automatic height.
            return 4; 
        },

        // The eventOrder property uses the new detailed sortPriority values.
        eventOrder: 'extendedProps.sortPriority desc,extendedProps.titleText',

        eventContent: function(arg) {
    let htmlContent = '';

    const viewType = arg.view.type;
    const { type, description } = arg.event.extendedProps;

    if (type === 'vacation' || type === 'officialHoliday' || type === 'publicHoliday') {
        // Vacation or Holiday
        let emoji = '';
        if (type === 'vacation') emoji = '🌴';
        else emoji = '🎉';

        // LIST VIEW STYLING
        if (viewType.startsWith('list')) {
            htmlContent = `<div class="fc-event-title">${emoji} ${description || arg.event.title}</div>`;
        } else {
            // Month view styling already handled by CSS
            htmlContent = `<div class="fc-event-title">${description || arg.event.title}</div>`;
        }
    } else {
        // Impact events
        if (viewType === 'dayGridMonth') {
            const mainTitleMatch = arg.event.title.match(/<span class="fc-event-title-main.*?">(.*?)<\/span>/);
            htmlContent = `<div class="fc-event-title">${mainTitleMatch ? mainTitleMatch[1] : 'Event'}</div>`;
        } else {
            htmlContent = arg.event.title;
        }
    }

    return { html: htmlContent };
},
        eventDidMount: function(info) {
            document.querySelectorAll('.tooltip').forEach(tooltip => tooltip.remove());
            if (info.event.extendedProps.description) {
                new bootstrap.Tooltip(info.el, { title: info.event.extendedProps.description, placement: 'top', trigger: 'hover', container: 'body', html: true });
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

        const checkEntity = (entity, isRegion = false) => {
            let worstStatus = 'covered';
            const impactDetails = [];
            const statusSummary = [];

            entity.requirements.forEach(req => {
                req.teams.forEach(teamName => {
                    const staffPool = isRegion
                        ? appData.employees.filter(e => e.team === teamName && entity.countries.includes(e.country))
                        : appData.employees.filter(e => e.team === teamName);
                    let onLeaveCount = 0;
                    const onLeaveNames = new Set();
                    staffPool.forEach(emp => {
                        let isEmployeeOnLeave = false;
                        const onHoliday = leaveEvents.find(leave => (leave.extendedProps.type === 'officialHoliday' || leave.extendedProps.type === 'publicHoliday') && leave.extendedProps.applicableCountries.includes(emp.country?.toLowerCase()) && currentDateStr >= leave.start && currentDateStr < (leave.end || new Date(new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]));
                        const onVacation = leaveEvents.find(leave => {
                            if (leave.extendedProps.type !== 'vacation') return false;
                            const vacationTitle = leave.extendedProps.employeeName;
                            if (!vacationTitle || !emp.name) return false;
                            if (vacationTitle.toLowerCase().includes(emp.name.toLowerCase())) {
                                const matchingEmployees = appData.employees.filter(e => vacationTitle.toLowerCase().includes(e.name.toLowerCase()));
                                if (matchingEmployees.length > 1) {
                                    console.warn(`AMBIGUOUS VACATION: Event "${vacationTitle}" could apply to multiple employees: ${matchingEmployees.map(e => e.name).join(', ')}. Matching with ${emp.name}.`);
                                }
                                return true;
                            }
                            return false;
                        });
                        if (onVacation && currentDateStr >= onVacation.start && currentDateStr < (onVacation.end || new Date(new Date(onVacation.start).setDate(new Date(onVacation.start).getDate() + 1)).toISOString().split('T')[0])) {
                            isEmployeeOnLeave = true;
                            onLeaveNames.add(`${emp.name} (Vacation)`);
                        } else if (onHoliday) {
                            isEmployeeOnLeave = true;
                            onLeaveNames.add(`${emp.name} (Holiday in ${emp.country})`);
                        }
                        if (isEmployeeOnLeave) onLeaveCount++;
                    });
                    const availableCount = staffPool.length - onLeaveCount;
                    let teamStatus = 'covered';
                    if (availableCount < req.min) teamStatus = 'critical';
                    else if (availableCount === req.min) teamStatus = 'warning';
                    if (teamStatus === 'critical') worstStatus = 'critical';
                    else if (teamStatus === 'warning' && worstStatus !== 'critical') worstStatus = 'warning';
                    let teamDetail = `<b>Team ${teamName}:</b> ${availableCount}/${staffPool.length} (Req: ${req.min})`;
                    if (teamStatus !== 'covered') {
                        statusSummary.push(`${teamName}: ${availableCount}/${req.min}`);
                        teamDetail += ` <strong class="text-${teamStatus === 'critical' ? 'danger' : 'warning'}">(${teamStatus.charAt(0).toUpperCase() + teamStatus.slice(1)})</strong>`;
                    } else {
                        teamDetail += ` (OK)`;
                    }
                    if (teamStatus !== 'covered' || onLeaveNames.size > 0) {
                        impactDetails.push(teamDetail);
                        if (onLeaveNames.size > 0) {
                            impactDetails.push(`<small><i>- On Leave: ${[...onLeaveNames].join(', ')}</i></small>`);
                        }
                    }
                });
            });

            // FIX #1: Don't create an event if the status is "covered"
            if (worstStatus === 'covered') {
                return; // Exit the function for this entity, no event will be created
            }

            // FIX #2: Use the correct ascending priority order
            const sortPriorityMap = {
                critical_region: 10,
                critical_customer: 20,
                warning_region: 30,
                warning_customer: 40,
                // covered priorities are no longer needed but kept for reference
                covered_region: 50,
                covered_customer: 60
            };

            const entityType = isRegion ? 'region' : 'customer';
            const sortKey = `${worstStatus}_${entityType}`;
            const sortPriority = sortPriorityMap[sortKey];

            const plainTitle = isRegion ? `[Region] ${entity.name}` : entity.name;
            const statusClass = `impact-event impact-${worstStatus}`;

            // This was the other bug - the class inside the span was wrong. It is now correct.
            let titleHtml = `<span class="fc-event-title-main impact-${worstStatus}">${plainTitle}</span>`;

            if (statusSummary.length > 0) {
                titleHtml += `<span class="fc-event-status-details">${statusSummary.join(' | ')}</span>`;
            }

            const description = impactDetails.length > 0 ? impactDetails.join('<br>') : `All teams are fully covered.`;

            const eventData = {
                title: titleHtml,
                start: currentDateStr,
                allDay: true,
                className: statusClass,
                extendedProps: {
                    description,
                    sortPriority,
                    titleText: plainTitle
                }
            };
            
            if (worstStatus === 'critical') {
                eventData.display = 'block';
            }

            impactEvents.push(eventData);
        };

        appData.customers.forEach(customer => checkEntity(customer, false));
        appData.regions.forEach(region => checkEntity(region, true));
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
        promises.push(gapi.client.calendar.events.list({ calendarId: vacationCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'vacation' })));
    }
    if (holidayCalendarId) {
        promises.push(gapi.client.calendar.events.list({ calendarId: holidayCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'officialHoliday' })));
    }
    const employeeCountryCalendars = [...new Set(appData.employees.filter(e => e.country).map(e => e.country.toLowerCase()))].map(code => ({ calendarId: `en.${code.toLowerCase()}#holiday@group.v.calendar.google.com`, countryCode: code }));
    employeeCountryCalendars.forEach(cal => {
        promises.push(gapi.client.calendar.events.list({ calendarId: cal.calendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'publicHoliday', countryCode: cal.countryCode })).catch(() => null));
    });
    const results = await Promise.allSettled(promises);
    let allEvents = [];
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            const { response, type, countryCode } = result.value;
            const events = response.result.items || [];
            const mappedEvents = events.map(event => {
                let cleanEventTitle = event.summary;
                let applicableCountries = [];
                let employeeName = null;
                let eventClassName = 'leave-event';
                let displayDescription = event.summary; // Default description

                if (type === 'vacation') {
                    employeeName = event.summary.trim();
                    cleanEventTitle = employeeName;
                    displayDescription = employeeName; // For vacations, the description is just the name
                    eventClassName = 'vacation-event';
                } else { // Holiday
                    if (countryCode) { applicableCountries.push(countryCode.toLowerCase()); }
                    const titleMatch = event.summary.match(/^([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)\s*-\s*(.*)$/);
                    if (titleMatch) { 
                        cleanEventTitle = titleMatch[2]; 
                        const countriesFromTitle = titleMatch[1].split(',').map(c => c.trim().toLowerCase()); 
                        applicableCountries = [...new Set([...applicableCountries, ...countriesFromTitle])]; 
                        // COUNTRY DISPLAY FIX: Rebuild the description with country codes
                        displayDescription = `${countriesFromTitle.join(', ').toUpperCase()} - ${cleanEventTitle}`;
                    }
                    eventClassName = 'holiday-event';
                }
                
                return {
                    title: event.summary, // Keep original title for internal use
                    start: event.start.date || event.start.dateTime,
                    end: event.end.date || event.end.dateTime,
                    allDay: !!event.start.date,
                    className: eventClassName,
                    extendedProps: {
                        employeeName,
                        type,
                        description: displayDescription, // Use the rebuilt description for display
                        applicableCountries,
                        sortPriority: 100 
                    }
                };
            });
            allEvents = allEvents.concat(mappedEvents);
        }
    });
    return allEvents;
}


// Google Auth functions
window.gisLoaded = function() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: '', }); gisInited = true; maybeEnableButtons(); };
async function initializeGapiClient() { try { await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS }); gapiInited = true; maybeEnableButtons(); if (gapi.client.getToken()) { populateCalendarSelectors(); } } catch (e) { console.error("Error initializing GAPI client:", e); } }
function maybeEnableButtons() { if (gapiInited && gisInited) { document.getElementById('authorize_button').style.visibility = 'visible'; } }
function handleAuthClick() { tokenClient.callback = async (resp) => { if (resp.error) throw (resp); document.getElementById('signout_button').style.display = 'block'; document.getElementById('authorize_button').innerText = 'Refresh Connection'; await populateCalendarSelectors(); calendar.refetchEvents(); }; if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({ prompt: 'consent' }); } else { tokenClient.requestAccessToken({ prompt: '' }); } }
function handleSignoutClick() { const token = gapi.client.getToken(); if (token !== null) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); document.getElementById('signout_button').style.display = 'none'; document.getElementById('authorize_button').innerText = 'Connect Google Calendar'; document.getElementById('calendar-selection-ui').style.display = 'none'; appData.settings.vacationCalendarId = null; appData.settings.holidayCalendarId = null; saveDataToLocalStorage(); calendar.refetchEvents(); } }
async function populateCalendarSelectors() { try { const response = await gapi.client.calendar.calendarList.list(); const calendars = response.result.items; const vacationSelect = document.getElementById('vacation-calendar-select'); const holidaySelect = document.getElementById('holiday-calendar-select'); vacationSelect.innerHTML = '<option value="">-- Select a calendar --</option>'; holidaySelect.innerHTML = '<option value="">-- Select a calendar --</option>'; calendars.forEach(cal => { const option = new Option(cal.summary, cal.id); vacationSelect.add(option.cloneNode(true)); holidaySelect.add(option); }); if (appData.settings.vacationCalendarId) { vacationSelect.value = appData.settings.vacationCalendarId; } if (appData.settings.holidayCalendarId) { holidaySelect.value = appData.settings.holidayCalendarId; } document.getElementById('calendar-selection-ui').style.display = 'block'; } catch (error) { console.error("Could not fetch user's calendar list:", error); alert("Could not load your calendar list. Please try refreshing or re-connecting."); } }
