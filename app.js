// app.js

// =================================================================================
// 1. APPLICATION SETUP & STATE MANAGEMENT
// =================================================================================

let appData = { customers: [], employees: [], regions: [], settings: { vacationCalendarId: null, holidayCalendarId: null } };
let calendar, dataModal, issuesChart, leaveChart, customersTable, regionsTable, employeesTable;
let dailyStatusHeatmap = {};

const GOOGLE_API_KEY = 'AIzaSyCXlCu4Xl4iu94TwGmtOHv_BvEUZxlwPSk';
const GOOGLE_CLIENT_ID = '612439385835-vvddjfvh151k187liqauarg6gnl0tjds.apps.googleusercontent.com';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";
let tokenClient, gapiInited = false, gisInited = false;

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    console.log("Initializing App...");
    dataModal = new bootstrap.Modal(document.getElementById('data-modal'));
    loadDataFromLocalStorage();
    setupEventListeners();
    initializeTheme();
    initializeCharts();
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
    document.getElementById('theme-toggle').addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-bs-theme', theme);
        localStorage.setItem('theme', theme);
        initializeCharts();
        updateDashboardAndCharts();
    });
    document.getElementById('forecast-start-date').addEventListener('change', updateDashboardAndCharts);
    document.getElementById('csv-import').addEventListener('change', handleCsvImport);
    document.getElementById('download-template-btn').addEventListener('click', downloadCsvTemplate);
    document.getElementById('export-data-btn').addEventListener('click', handleDataExport);
    document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
    document.getElementById('signout_button').addEventListener('click', handleSignoutClick);
    document.getElementById('vacation-calendar-select').addEventListener('change', (e) => { appData.settings.vacationCalendarId = e.target.value; saveDataToLocalStorage(); calendar.refetchEvents(); });
    document.getElementById('holiday-calendar-select').addEventListener('change', (e) => { appData.settings.holidayCalendarId = e.target.value; saveDataToLocalStorage(); calendar.refetchEvents(); });
    document.getElementById('export-pdf-btn').addEventListener('click', handlePdfExport);
    document.getElementById('export-excel-btn').addEventListener('click', handleXlsxExport);
    document.getElementById('export-period-select').addEventListener('change', (e) => { document.getElementById('custom-date-range').style.display = e.target.value === 'custom' ? 'flex' : 'none'; });
    document.getElementById('add-customer-btn').addEventListener('click', () => openDataModal('customer'));
    document.getElementById('add-region-btn').addEventListener('click', () => openDataModal('region'));
    document.getElementById('add-employee-btn').addEventListener('click', () => openDataModal('employee'));
    document.getElementById('save-btn').addEventListener('click', saveDataFromModal);
    document.getElementById('delete-btn').addEventListener('click', deleteDataFromModal);
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark'; // Default to dark
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    document.getElementById('theme-toggle').checked = savedTheme === 'dark';
}

function renderManagementTables() {
    if (customersTable) customersTable.destroy();
    if (regionsTable) regionsTable.destroy();
    if (employeesTable) employeesTable.destroy();
    const renderRow = (item, type) => {
        let cells = '';
        switch(type) {
            case 'customer': cells = `<td>${item.name}</td><td>${item.country}</td><td>${item.requirements.map(r => `${r.teams.join(', ')} (${r.min})`).join('<br>')}</td>`; break;
            case 'region': cells = `<td>${item.name}</td><td>${item.countries.join(', ')}</td><td>${item.requirements.map(r => `${r.teams.join(', ')} (${r.min})`).join('<br>')}</td>`; break;
            case 'employee': cells = `<td>${item.name}</td><td>${item.country}</td><td>${item.team}</td>`; break;
        }
        return `<tr data-id="${item.id}">${cells}<td><button class="btn btn-sm btn-outline-secondary edit-btn"><i class="bi bi-pencil"></i></button></td></tr>`;
    };
    document.getElementById('customers-table').innerHTML = `<thead><tr><th>Name</th><th>Country</th><th>Requirements</th><th>Edit</th></tr></thead><tbody>${appData.customers.map(c => renderRow(c, 'customer')).join('')}</tbody>`;
    document.getElementById('regions-table').innerHTML = `<thead><tr><th>Name</th><th>Countries</th><th>Requirements</th><th>Edit</th></tr></thead><tbody>${appData.regions.map(r => renderRow(r, 'region')).join('')}</tbody>`;
    document.getElementById('employees-table').innerHTML = `<thead><tr><th>Name</th><th>Country</th><th>Team</th><th>Edit</th></tr></thead><tbody>${appData.employees.map(e => renderRow(e, 'employee')).join('')}</tbody>`;
    const dtOptions = { scrollX: true, lengthMenu: [5, 10, 25], pageLength: 5 };
    customersTable = new DataTable('#customers-table', dtOptions);
    regionsTable = new DataTable('#regions-table', dtOptions);
    employeesTable = new DataTable('#employees-table', dtOptions);
    document.querySelector('#customers-panel').addEventListener('click', e => { if(e.target.closest('.edit-btn')) openDataModal('customer', e.target.closest('tr').dataset.id) });
    document.querySelector('#regions-panel').addEventListener('click', e => { if(e.target.closest('.edit-btn')) openDataModal('region', e.target.closest('tr').dataset.id) });
    document.querySelector('#employees-panel').addEventListener('click', e => { if(e.target.closest('.edit-btn')) openDataModal('employee', e.target.closest('tr').dataset.id) });
}

// =================================================================================
// 3. MODAL & DATA EDITING LOGIC
// =================================================================================
function openDataModal(type, id = null) {
    const formFields = document.getElementById('form-fields');
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-type').value = type;
    document.getElementById('delete-btn').style.display = id ? 'block' : 'none';
    let data = {};
    let title = `Add New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    let fieldsHtml = '';
    if (id) {
        title = `Edit ${type.charAt(0).toUpperCase() + type.slice(1)}`;
        if (type === 'customer') data = appData.customers.find(item => item.id == id);
        if (type === 'region') data = appData.regions.find(item => item.id == id);
        if (type === 'employee') data = appData.employees.find(item => item.id == id);
    }
    switch(type) {
        case 'employee': fieldsHtml = `<div class="mb-3"><label for="name" class="form-label">Name</label><input type="text" class="form-control" id="name" value="${data.name || ''}"></div><div class="mb-3"><label for="country" class="form-label">Country Code</label><input type="text" class="form-control" id="country" value="${data.country || ''}"></div><div class="mb-3"><label for="team" class="form-label">Team</label><input type="text" class="form-control" id="team" value="${data.team || ''}"></div>`; break;
        case 'customer': fieldsHtml = `<div class="mb-3"><label for="name" class="form-label">Name</label><input type="text" class="form-control" id="name" value="${data.name || ''}"></div><div class="mb-3"><label for="country" class="form-label">Country Code</label><input type="text" class="form-control" id="country" value="${data.country || ''}"></div><p class="small text-muted">One requirement per line: teams(comma-sep),min_required (e.g., "fenix,rudras,1")</p><div class="mb-3"><label for="requirements" class="form-label">Requirements</label><textarea class="form-control" id="requirements" rows="3">${data.requirements ? data.requirements.map(r => `${r.teams.join(',')},${r.min}`).join('\n') : ''}</textarea></div>`; break;
        case 'region': fieldsHtml = `<div class="mb-3"><label for="name" class="form-label">Name</label><input type="text" class="form-control" id="name" value="${data.name || ''}"></div><div class="mb-3"><label for="country" class="form-label">Countries (comma-separated)</label><input type="text" class="form-control" id="country" value="${data.countries ? data.countries.join(',') : ''}"></div><p class="small text-muted">One requirement per line: teams(comma-sep),min_required (e.g., "fenix,rudras,1")</p><div class="mb-3"><label for="requirements" class="form-label">Requirements</label><textarea class="form-control" id="requirements" rows="3">${data.requirements ? data.requirements.map(r => `${r.teams.join(',')},${r.min}`).join('\n') : ''}</textarea></div>`; break;
    }
    document.getElementById('dataModalLabel').textContent = title;
    formFields.innerHTML = fieldsHtml;
    dataModal.show();
}
function saveDataFromModal() {
    const id = document.getElementById('edit-id').value; const type = document.getElementById('edit-type').value; const isNew = !id; let item = {};
    switch (type) {
        case 'employee': item = { id: isNew ? Date.now() : Number(id), name: document.getElementById('name').value, country: document.getElementById('country').value, team: document.getElementById('team').value }; if (isNew) appData.employees.push(item); else appData.employees = appData.employees.map(e => e.id == id ? item : e); break;
        case 'customer': case 'region':
            const reqsText = document.getElementById('requirements').value; const requirements = reqsText.split('\n').filter(Boolean).map(line => { const parts = line.split(','); const min = parseInt(parts.pop(), 10); return { teams: parts.map(t=>t.trim()), min }; });
            if (type === 'customer') { item = { id: isNew ? Date.now() : Number(id), name: document.getElementById('name').value, country: document.getElementById('country').value, requirements }; if (isNew) appData.customers.push(item); else appData.customers = appData.customers.map(c => c.id == id ? item : c); }
            else { item = { id: isNew ? Date.now() : Number(id), name: document.getElementById('name').value, countries: document.getElementById('country').value.split(',').map(c => c.trim()), requirements }; if (isNew) appData.regions.push(item); else appData.regions = appData.regions.map(r => r.id == id ? item : r); }
            break;
    }
    saveDataToLocalStorage(); renderManagementTables(); calendar.refetchEvents(); dataModal.hide();
}
function deleteDataFromModal() {
    const id = document.getElementById('edit-id').value; const type = document.getElementById('edit-type').value; if (!confirm(`Are you sure you want to delete this ${type}?`)) return;
    if (type === 'customer') appData.customers = appData.customers.filter(c => c.id != id); if (type === 'region') appData.regions = appData.regions.filter(r => r.id != id); if (type === 'employee') appData.employees = appData.employees.filter(e => e.id != id);
    saveDataToLocalStorage(); renderManagementTables(); calendar.refetchEvents(); dataModal.hide();
}

// =================================================================================
// 4. CSV & DATA EXPORT
// =================================================================================

function handleDataExport() { const dataToExport = []; appData.customers.forEach(c => c.requirements.forEach(r => dataToExport.push({ type: 'customer', name: c.name, country: c.country, field_1_condition: 'required_team', field_1_value: r.teams.join(','), field_2_condition: 'required_employee_per_team', field_2_value: r.min }))); appData.regions.forEach(reg => reg.requirements.forEach(r => dataToExport.push({ type: 'region', name: reg.name, country: reg.countries.join(','), field_1_condition: 'required_team', field_1_value: r.teams.join(','), field_2_condition: 'required_employee_per_team', field_2_value: r.min }))); appData.employees.forEach(e => dataToExport.push({ type: 'employee', name: e.name, country: e.country, field_1_condition: 'team', field_1_value: e.team, field_2_condition: '', field_2_value: '' })); const csv = Papa.unparse(dataToExport); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.setAttribute("href", URL.createObjectURL(blob)); link.setAttribute("download", `coverage_data_backup_${new Date().toISOString().split('T')[0]}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
function downloadCsvTemplate(event) { event.preventDefault(); const csvContent = "type,name,country,field_1_condition,field_1_value,field_2_condition,field_2_value\ncustomer,Heron,AUH,required_team,\"product_ASIA,fenix,rudras\",required_employee_per_team,1\nemployee,Diego Córdova,CHI,team,fenix,,\nregion,ASIA,\"IND,QAR,AUH\",required_team,\"product_ASIA,fenix,rudras\",required_employee_per_team,1"; const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.setAttribute("href", URL.createObjectURL(blob)); link.setAttribute("download", "final_template.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
function handleCsvImport(event) { const file = event.target.files[0]; if (file) { Papa.parse(file, { header: true, skipEmptyLines: true, encoding: "UTF-8", complete: (results) => { processGenericCsvData(results.data); saveDataToLocalStorage(); alert('Data imported successfully. The page will now refresh.'); location.reload(); }, error: (err) => alert(`CSV Parsing Error: ${err.message}`) }); } }
function parseGenericFields(row) { const fields = {}; for (let i = 1; i <= 4; i++) { const condition = row[`field_${i}_condition`]; const value = row[`field_${i}_value`]; if (condition) { fields[condition] = value; } } return fields; }
function processGenericCsvData(data) { appData.customers = []; appData.employees = []; appData.regions = []; const generateId = () => Date.now() + Math.random(); data.forEach(row => { const type = row.type?.toLowerCase().trim(); const fields = parseGenericFields(row); if (type === 'employee') { appData.employees.push({ id: generateId(), name: row.name, country: row.country, team: fields.team }); } else if (type === 'customer' || type === 'region') { const requirement = { teams: (fields.required_team || '').split(',').map(t => t.trim()), min: parseInt(fields.required_employee_per_team, 10) || 1 }; if (type === 'customer') { let customer = appData.customers.find(c => c.name === row.name); if (!customer) { customer = { id: generateId(), name: row.name, country: row.country, requirements: [] }; appData.customers.push(customer); } customer.requirements.push(requirement); } else { let region = appData.regions.find(r => r.name === row.name); if (!region) { region = { id: generateId(), name: row.name, countries: (row.country || '').split(',').map(c => c.trim()), requirements: [] }; appData.regions.push(region); } region.requirements.push(requirement); } } }); }

// =================================================================================
// 5. CALENDAR LOGIC ENGINE
// =================================================================================

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },
        views: { listWeek: { omitZeroEvents: false } },
        dayMaxEvents: false,
        eventOrder: 'extendedProps.sortPriority desc,title',
        loading: (isLoading) => document.getElementById('calendar-loader').classList.toggle('visible', isLoading),
        eventsSet: () => updateDashboardAndCharts(),
        dayCellDidMount: (arg) => {
            const dateStr = arg.date.toISOString().split('T')[0];
            const status = dailyStatusHeatmap[dateStr];
            arg.el.classList.remove('day-bg-critical', 'day-bg-warning');
            if (status === 'critical') arg.el.classList.add('day-bg-critical');
            else if (status === 'warning') arg.el.classList.add('day-bg-warning');
        },
        eventContent: (arg) => ({ html: arg.event.extendedProps.customHtml || arg.event.title }),
        eventDidMount: (info) => { if (info.event.extendedProps.description) new bootstrap.Tooltip(info.el, { title: info.event.extendedProps.description, placement: 'top', trigger: 'hover', container: 'body', html: true }); },
        listDayFormat: { month: 'long', day: 'numeric', year: 'numeric', weekday: 'long' },
        buttonText: { listWeek: 'week', dayGridMonth: 'month' },
        noEventsContent: 'No coverage issues or leave scheduled.',
    });
    calendar.setOption('events', fetchCalendarEvents);
    calendar.render();
}
function generateImpactEvents(fetchInfo, leaveEvents = []) { const impactEvents = []; dailyStatusHeatmap = {}; const { start, end } = fetchInfo; for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) { const currentDateStr = day.toISOString().split('T')[0]; const checkEntity = (entity, isRegion = false) => { let worstStatus = 'covered'; const detailedDescriptions = []; entity.requirements.forEach(req => req.teams.forEach(teamName => { const staffPool = isRegion ? appData.employees.filter(e => e.team === teamName && entity.countries.includes(e.country)) : appData.employees.filter(e => e.team === teamName); const onLeave = staffPool.filter(emp => leaveEvents.some(leave => (leave.extendedProps.applicableCountries.includes(emp.country?.toLowerCase()) || leave.extendedProps.employeeName?.toLowerCase().includes(emp.name.toLowerCase())) && currentDateStr >= leave.start && currentDateStr < (leave.end || new Date(new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0]))); const availableCount = staffPool.length - onLeave.length; let teamStatus = 'covered'; if (availableCount < req.min) teamStatus = 'critical'; else if (availableCount === req.min) teamStatus = 'warning'; if (teamStatus === 'critical') worstStatus = 'critical'; else if (teamStatus === 'warning' && worstStatus !== 'critical') worstStatus = 'warning'; if (teamStatus !== 'covered') { let detail = `<b>Team ${teamName}:</b> ${availableCount}/${staffPool.length} (Req: ${req.min})`; if (onLeave.length > 0) detail += `<br><small><i>- On Leave: ${onLeave.map(e => e.name).join(', ')}</i></small>`; detailedDescriptions.push(detail); } })); if (worstStatus === 'critical' || (worstStatus === 'warning' && dailyStatusHeatmap[currentDateStr] !== 'critical')) dailyStatusHeatmap[currentDateStr] = worstStatus; if (worstStatus === 'covered') return; const sortPriorityMap = { critical_region: 10, critical_customer: 20, warning_region: 30, warning_customer: 40 }; const entityType = isRegion ? 'region' : 'customer'; const plainTitle = isRegion ? `[Region] ${entity.name}` : entity.name; const icon = worstStatus === 'critical' ? '<i class="bi bi-exclamation-octagon-fill text-danger"></i>' : '<i class="bi bi-exclamation-triangle-fill text-warning"></i>'; const titleHtml = `<div class="fc-event-title">${icon}<span class="ms-2">${plainTitle}</span></div>`; impactEvents.push({ title: plainTitle, start: currentDateStr, allDay: true, className: `impact-event impact-${worstStatus}`, extendedProps: { description: `<strong>${plainTitle} (${worstStatus.toUpperCase()})</strong><hr class="my-1">${detailedDescriptions.join('<hr class="my-1">')}`, customHtml: titleHtml, sortPriority: sortPriorityMap[`${worstStatus}_${entityType}`], status: worstStatus, type: 'impact', entityName: entity.name }}); }; appData.customers.forEach(customer => checkEntity(customer, false)); appData.regions.forEach(region => checkEntity(region, true)); } return impactEvents; }

// =================================================================================
// 6. GOOGLE CALENDAR API & CORE FETCH
// =================================================================================

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const leaveEvents = await fetchGoogleCalendarData(fetchInfo);
        const impactEvents = generateImpactEvents(fetchInfo, leaveEvents);
        successCallback([...impactEvents, ...leaveEvents]);
    } catch (error) { 
        console.error("Failed to fetch/process events:", error); 
        failureCallback(error); 
    }
}
async function fetchGoogleCalendarData(fetchInfo) { const { vacationCalendarId, holidayCalendarId } = appData.settings; if (gapi.client.getToken() === null) return []; const { startStr, endStr } = fetchInfo; const promises = []; if (vacationCalendarId) { promises.push(gapi.client.calendar.events.list({ calendarId: vacationCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'vacation' }))); } if (holidayCalendarId) { promises.push(gapi.client.calendar.events.list({ calendarId: holidayCalendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'officialHoliday' }))); } const employeeCountryCalendars = [...new Set(appData.employees.filter(e => e.country).map(e => e.country.toLowerCase()))].map(code => ({ calendarId: `en.${code.toLowerCase()}#holiday@group.v.calendar.google.com`, countryCode: code })); employeeCountryCalendars.forEach(cal => { promises.push(gapi.client.calendar.events.list({ calendarId: cal.calendarId, timeMin: startStr, timeMax: endStr, singleEvents: true, orderBy: 'startTime' }).then(response => ({ response, type: 'publicHoliday', countryCode: cal.countryCode })).catch(() => null)); }); const results = await Promise.allSettled(promises); let allEvents = []; results.forEach(result => { if (result.status === 'fulfilled' && result.value) { const { response, type, countryCode } = result.value; const events = response.result.items || []; const mappedEvents = events.map(event => { let displayDescription = event.summary; let employeeName = null; let applicableCountries = []; if (type === 'vacation') { employeeName = event.summary.trim(); displayDescription = `🌴 ${employeeName}`; } else { if (countryCode) { applicableCountries.push(countryCode.toLowerCase()); } const titleMatch = event.summary.match(/^([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)\s*-\s*(.*)$/); if (titleMatch) { const countriesFromTitle = titleMatch[1].split(',').map(c => c.trim().toLowerCase()); applicableCountries = [...new Set([...applicableCountries, ...countriesFromTitle])]; displayDescription = `🎉 ${countriesFromTitle.join(', ').toUpperCase()} - ${titleMatch[2]}`; } else { displayDescription = `🎉 ${event.summary}`; } } return { title: displayDescription, start: event.start.date || event.start.dateTime, end: event.end.date || event.end.dateTime, allDay: !!event.start.date, className: type === 'vacation' ? 'vacation-event' : 'holiday-event', extendedProps: { employeeName, type, description: displayDescription.replace(/^[🌴🎉]\s*/, ''), applicableCountries, sortPriority: 100 } }; }); allEvents = allEvents.concat(mappedEvents); } }); return allEvents; }

// =================================================================================
// 7. DASHBOARD & CHARTS LOGIC (FIXED)
// =================================================================================

function initializeCharts() { if (issuesChart) issuesChart.destroy(); if (leaveChart) leaveChart.destroy(); const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark'; const textColor = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'; const forecastDateInput = document.getElementById('forecast-start-date'); if (!forecastDateInput.value) { forecastDateInput.value = new Date().toISOString().split('T')[0]; } issuesChart = new Chart(document.getElementById('issues-chart'), { type: 'bar', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: false }, legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.raw}` } } }, scales: { x: { stacked: true, ticks: { color: textColor } }, y: { stacked: true, beginAtZero: true, ticks: { color: textColor, stepSize: 1 } } } } }); leaveChart = new Chart(document.getElementById('leave-chart'), { type: 'doughnut', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Leave Types', color: textColor }, legend: { position: 'right', labels: { color: textColor } }, tooltip: { callbacks: { label: (context) => { const label = context.label || ''; const details = context.chart.data.tooltipDetails[label]; return details && details.length ? `${label}: ${details.length}` : label; }, afterLabel: (context) => { const details = context.chart.data.tooltipDetails[context.label]; return details && details.length ? details.slice(0, 5).join('\n') + (details.length > 5 ? '\n...' : '') : ''; } } } } } }); }

async function updateDashboardAndCharts() {
    const allEvents = calendar.getEvents();
    if (!allEvents.length && gapi.client.getToken()) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const impactEvents = allEvents.filter(e => e.extendedProps.type === 'impact');
    const leaveEvents = allEvents.filter(e => e.extendedProps.type !== 'impact');
    const view = calendar.view;

    const onLeaveTodayEvents = leaveEvents.filter(e => { const start = e.startStr.split('T')[0]; const end = e.endStr ? e.endStr.split('T')[0] : start; return todayStr >= start && todayStr < end; });
    const onLeaveNames = new Set(onLeaveTodayEvents.map(e => e.extendedProps.employeeName).filter(Boolean));
    document.getElementById('kpi-on-leave').textContent = onLeaveNames.size;
    
    const understaffedInView = impactEvents.filter(e => e.extendedProps.status === 'critical' && e.start >= view.activeStart && e.start < view.activeEnd);
    const understaffedDays = new Set(understaffedInView.map(e=>e.startStr.split('T')[0]));
    const understaffedNames = new Set(understaffedInView.map(e => e.extendedProps.entityName));
    document.getElementById('kpi-understaffed').textContent = understaffedDays.size;
    document.getElementById('kpi-understaffed-range').textContent = `(${view.title})`;

    // *** FIX: At Risk KPI must use its own forecast calculation ***
    const forecastStart = new Date(); const forecastEnd = new Date(); forecastEnd.setDate(forecastStart.getDate() + 14);
    const forecastLeaveEvents = await fetchGoogleCalendarData({ start: forecastStart, end: forecastEnd, startStr: forecastStart.toISOString(), endStr: forecastEnd.toISOString()});
    const forecastImpactEvents = generateImpactEvents({ start: forecastStart, end: forecastEnd }, forecastLeaveEvents);
    
    const nextSevenDays = Array.from({length: 7}, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0]; });
    const atRiskInNext7Days = forecastImpactEvents.filter(e => nextSevenDays.includes(e.start));
    const atRiskNames = new Set(atRiskInNext7Days.map(e => e.extendedProps.entityName));
    document.getElementById('kpi-at-risk').textContent = atRiskNames.size;
    
    const tooltipMap = { 'kpi-at-risk-card': { set: atRiskNames, default: 'No customers at risk.'}, 'kpi-understaffed-card': { set: understaffedNames, default: 'No understaffed customers.' }, 'kpi-on-leave-card': { set: onLeaveNames, default: 'No one is on leave today.' } };
    for (const [id, data] of Object.entries(tooltipMap)) {
        const card = document.getElementById(id);
        const tooltip = bootstrap.Tooltip.getInstance(card) || new bootstrap.Tooltip(card);
        tooltip.setContent({ '.tooltip-inner': data.set.size > 0 ? Array.from(data.set).join('\n') : data.default });
    }
    
    // *** FIX: Forecast chart must use its own calculated data ***
    const dynamicForecastStart = new Date(document.getElementById('forecast-start-date').value);
    const dynamicForecastEnd = new Date(dynamicForecastStart);
    dynamicForecastEnd.setDate(dynamicForecastStart.getDate() + 14);
    const dynamicLeave = await fetchGoogleCalendarData({ start: dynamicForecastStart, end: dynamicForecastEnd, startStr: dynamicForecastStart.toISOString(), endStr: dynamicForecastEnd.toISOString()});
    const dynamicImpact = generateImpactEvents({ start: dynamicForecastStart, end: dynamicForecastEnd }, dynamicLeave);
    
    const forecastCounts = {};
    for (let i = 0; i < 14; i++) { const d = new Date(dynamicForecastStart); d.setDate(d.getDate() + i); const dateStr = d.toISOString().split('T')[0]; const dateLabel = dateStr.substring(5); forecastCounts[dateLabel] = { warning: 0, critical: 0 }; dynamicImpact.forEach(e => { if (e.start === dateStr) forecastCounts[dateLabel][e.extendedProps.status]++; }); }
    issuesChart.data.labels = Object.keys(forecastCounts);
    issuesChart.data.datasets = [{ label: 'Warning', data: Object.values(forecastCounts).map(d => d.warning), backgroundColor: 'rgba(255, 183, 3, 0.7)' }, { label: 'Critical', data: Object.values(forecastCounts).map(d => d.critical), backgroundColor: 'rgba(217, 4, 41, 0.7)' }];
    issuesChart.update();

    const leaveDetails = { 'Vacation': new Set(), 'Official Holiday': new Set(), 'Public Holiday': new Set() };
    leaveEvents.forEach(e => { const typeLabel = e.extendedProps.type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); if (leaveDetails[typeLabel]) leaveDetails[typeLabel].add(e.extendedProps.description); });
    leaveChart.data.labels = Object.keys(leaveDetails);
    leaveChart.data.datasets = [{ data: Object.values(leaveDetails).map(s => s.size), backgroundColor: ['#007bff', '#28a745', '#17a2b8'] }];
    leaveChart.data.tooltipDetails =  Object.fromEntries(Object.entries(leaveDetails).map(([key, value]) => [key, Array.from(value)]));
    leaveChart.options.plugins.title.text = `Leave Types (${view.title})`;
    leaveChart.update();
}


// =================================================================================
// 8. REPORTING & EXPORTING
// =================================================================================

function getExportDateRange() { const selector = document.getElementById('export-period-select'); const today = new Date(); today.setHours(0, 0, 0, 0); let start, end; switch (selector.value) { case 'lastTwoWeeks': end = new Date(today); start = new Date(today); start.setDate(start.getDate() - 14); break; case 'nextTwoWeeks': start = new Date(today); end = new Date(today); end.setDate(end.getDate() + 14); break; case 'currentMonth': start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); break; case 'nextMonth': start = new Date(today.getFullYear(), today.getMonth() + 1, 1); end = new Date(today.getFullYear(), today.getMonth() + 2, 0); break; case 'custom': const startDateValue = document.getElementById('custom-start-date').value; const endDateValue = document.getElementById('custom-end-date').value; if (!startDateValue || !endDateValue) { alert('Please select both a start and end date for the custom range.'); return null; } start = new Date(startDateValue); end = new Date(endDateValue); start = new Date(start.valueOf() + start.getTimezoneOffset() * 60000); end = new Date(end.valueOf() + end.getTimezoneOffset() * 60000); end.setDate(end.getDate() + 1); break; default: start = calendar.view.activeStart; end = calendar.view.activeEnd; break; } if (selector.value !== 'currentView' && selector.value !== 'custom') end.setDate(end.getDate() + 1); return { start, end }; }
async function generateReportData(start, end) { const reportEntries = []; const fetchInfo = { startStr: start.toISOString(), endStr: end.toISOString() }; const leaveEvents = await fetchGoogleCalendarData(fetchInfo); for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) { const currentDateStr = day.toISOString().split('T')[0]; const checkEntityForReport = (entity, isRegion = false) => { entity.requirements.forEach(req => req.teams.forEach(teamName => { const staffPool = isRegion ? appData.employees.filter(e => e.team === teamName && entity.countries.includes(e.country)) : appData.employees.filter(e => e.team === teamName); let onLeaveCount = 0; const onLeaveNames = new Set(); staffPool.forEach(emp => { let isEmployeeOnLeave = false; const onHoliday = leaveEvents.find(leave => (leave.extendedProps.type === 'officialHoliday' || leave.extendedProps.type === 'publicHoliday') && leave.extendedProps.applicableCountries.includes(emp.country?.toLowerCase()) && currentDateStr >= leave.start && currentDateStr < (leave.end || new Date(new Date(leave.start).setDate(new Date(leave.start).getDate() + 1)).toISOString().split('T')[0])); const onVacation = leaveEvents.find(leave => { if (leave.extendedProps.type !== 'vacation') return false; const vacationTitle = leave.extendedProps.employeeName; if (!vacationTitle || !emp.name) return false; return vacationTitle.toLowerCase().includes(emp.name.toLowerCase()); }); if (onVacation && currentDateStr >= onVacation.start && currentDateStr < (onVacation.end || new Date(new Date(onVacation.start).setDate(new Date(onVacation.start).getDate() + 1)).toISOString().split('T')[0])) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Vacation)`); } else if (onHoliday) { isEmployeeOnLeave = true; onLeaveNames.add(`${emp.name} (Holiday in ${emp.country})`); } if (isEmployeeOnLeave) onLeaveCount++; }); const availableCount = staffPool.length - onLeaveCount; let teamStatus = 'covered'; if (availableCount < req.min) teamStatus = 'critical'; else if (availableCount === req.min) teamStatus = 'warning'; if (teamStatus !== 'covered') { reportEntries.push({ date: currentDateStr, entityName: entity.name, entityType: isRegion ? 'Region' : 'Customer', status: teamStatus.charAt(0).toUpperCase() + teamStatus.slice(1), details: `Team ${teamName}: ${availableCount} available of ${staffPool.length} (Min Req: ${req.min})`, personnelOnLeave: [...onLeaveNames].join(', ') || 'N/A' }); } })); }; appData.customers.forEach(customer => checkEntityForReport(customer, false)); appData.regions.forEach(region => checkEntityForReport(region, true)); } reportEntries.sort((a, b) => { if (a.date < b.date) return -1; if (a.date > b.date) return 1; if (a.status === 'Critical' && b.status !== 'Critical') return -1; if (a.status !== 'Critical' && b.status === 'Critical') return 1; return a.entityName.localeCompare(b.entityName); }); return reportEntries; }
async function handlePdfExport() { const btn = document.getElementById('export-pdf-btn'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>'; try { const dateRange = getExportDateRange(); if (!dateRange) return; const reportData = await generateReportData(dateRange.start, dateRange.end); const statusFilter = document.querySelector('input[name="statusFilter"]:checked').value; let filteredReportData = reportData; if (statusFilter === 'critical') filteredReportData = reportData.filter(item => item.status === 'Critical'); else if (statusFilter === 'warning') filteredReportData = reportData.filter(item => item.status === 'Warning'); if (filteredReportData.length === 0) { const statusText = statusFilter === 'both' ? '' : `'${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}' `; alert(`No ${statusText}issues found in the selected period.`); return; } const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape' }); doc.text("Customer Coverage Impact Report", 14, 16); doc.setFontSize(10); const reportEndDate = new Date(dateRange.end.valueOf() - 864e5); doc.text(`Period: ${dateRange.start.toLocaleDateString()} to ${reportEndDate.toLocaleDateString()}`, 14, 22); const tableColumn = ["Date", "Entity Name", "Type", "Status", "Details", "Personnel on Leave"]; const tableRows = filteredReportData.map(item => Object.values(item)); doc.autoTable({ head: [tableColumn], body: tableRows, startY: 30, theme: 'grid', headStyles: { fillColor: [22, 160, 133] }, didDrawCell: (data) => { if (data.column.dataKey === 3 && data.cell.section === 'body') { const status = data.cell.text[0]; if (status === 'Critical') { doc.setTextColor(192, 57, 43); doc.setFont(undefined, 'bold'); } else if (status === 'Warning') { doc.setTextColor(211, 84, 0); } } }, willDrawCell: () => { doc.setTextColor(44, 62, 80); doc.setFont(undefined, 'normal'); } }); const dateStr = new Date().toISOString().split('T')[0]; doc.save(`coverage_report_${dateStr}.pdf`); } catch (error) { console.error("Error generating PDF report:", error); alert("An error occurred while generating the PDF report."); } finally { btn.disabled = false; btn.innerHTML = `<i class="bi bi-file-earmark-pdf-fill me-1"></i>Export PDF`; } }
async function handleXlsxExport() { const btn = document.getElementById('export-excel-btn'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>'; try { const dateRange = getExportDateRange(); if (!dateRange) return; const reportData = await generateReportData(dateRange.start, dateRange.end); const statusFilter = document.querySelector('input[name="statusFilter"]:checked').value; let filteredReportData = reportData; if (statusFilter === 'critical') filteredReportData = reportData.filter(item => item.status === 'Critical'); else if (statusFilter === 'warning') filteredReportData = reportData.filter(item => item.status === 'Warning'); if (filteredReportData.length === 0) { const statusText = statusFilter === 'both' ? '' : `'${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}' `; alert(`No ${statusText}issues found in the selected period.`); return; } const worksheet = XLSX.utils.json_to_sheet(filteredReportData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Coverage Report"); XLSX.utils.sheet_add_aoa(worksheet, [["Date", "Entity Name", "Type", "Status", "Details", "Personnel on Leave"]], { origin: "A1" }); const columnWidths = [ { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 50 }, { wch: 60 } ]; worksheet['!cols'] = columnWidths; const dateStr = new Date().toISOString().split('T')[0]; XLSX.writeFile(workbook, `coverage_report_${dateStr}.xlsx`, { compression: true }); } catch (error) { console.error("Error generating Excel report:", error); alert("An error occurred while generating the Excel report."); } finally { btn.disabled = false; btn.innerHTML = `<i class="bi bi-file-earmark-excel-fill me-1"></i>Export Excel`; } }

// =================================================================================
// 9. GOOGLE API INITIALIZATION & AUTH (RESTORED)
// =================================================================================

window.gisLoaded = function() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: '', }); gisInited = true; maybeEnableButtons(); };
async function initializeGapiClient() { try { await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS }); gapiInited = true; maybeEnableButtons(); if (gapi.client.getToken()) { populateCalendarSelectors(); } } catch (e) { console.error("Error initializing GAPI client:", e); } }
function maybeEnableButtons() { if (gapiInited && gisInited) { document.getElementById('authorize_button').style.visibility = 'visible'; } }
function handleAuthClick() { tokenClient.callback = async (resp) => { if (resp.error) throw (resp); document.getElementById('signout_button').style.display = 'block'; document.getElementById('authorize_button').innerText = 'Refresh Connection'; await populateCalendarSelectors(); calendar.refetchEvents(); }; if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({ prompt: 'consent' }); } else { tokenClient.requestAccessToken({ prompt: '' }); } }
function handleSignoutClick() { const token = gapi.client.getToken(); if (token !== null) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); document.getElementById('signout_button').style.display = 'none'; document.getElementById('authorize_button').innerText = 'Connect Google Calendar'; document.getElementById('calendar-selection-ui').style.display = 'none'; appData.settings.vacationCalendarId = null; appData.settings.holidayCalendarId = null; saveDataToLocalStorage(); calendar.refetchEvents(); } }
async function populateCalendarSelectors() { try { const response = await gapi.client.calendar.calendarList.list(); const calendars = response.result.items; const vacationSelect = document.getElementById('vacation-calendar-select'); const holidaySelect = document.getElementById('holiday-calendar-select'); vacationSelect.innerHTML = '<option value="">-- Select a calendar --</option>'; holidaySelect.innerHTML = '<option value="">-- Select a calendar --</option>'; calendars.forEach(cal => { const option = new Option(cal.summary, cal.id); vacationSelect.add(option.cloneNode(true)); holidaySelect.add(option); }); if (appData.settings.vacationCalendarId) { vacationSelect.value = appData.settings.vacationCalendarId; } if (appData.settings.holidayCalendarId) { holidaySelect.value = appData.settings.holidayCalendarId; } document.getElementById('calendar-selection-ui').style.display = 'block'; } catch (error) { console.error("Could not fetch user's calendar list:", error); alert("Could not load your calendar list. Please try refreshing or re-connecting."); } }
