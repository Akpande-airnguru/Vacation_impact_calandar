# Customer Impact Calendar

A browser-based dashboard that shows when customers and regions are at risk of being understaffed, based on team members' leave and public holidays from Google Calendar.

## How it works

1. You define **customers**, **regions** and **employees** (each employee has a country and a team).
2. Each customer or region has staffing **requirements**: which teams cover it and the minimum number of people needed.
3. The app reads leave and holidays from Google Calendar (read-only) and, for every day, counts who is available.
4. Each day is marked:
   - **Critical** (red): fewer people available than the minimum.
   - **Warning** (yellow): exactly the minimum available.
   - Covered days are not shown.

## Getting started

1. Open the app and click **Connect Google Calendar** (under Integrations). Sign in with your Google account and allow read-only calendar access.
2. Under **Leave Calendars**, tick every calendar whose events mean a person is unavailable (for example, a shared team leave calendar).
3. Under **Official Holiday Calendar**, choose the calendar that holds your company holidays.
4. Load your data with **Bulk Import from CSV** (use **Download CSV Template** for the format), or add items manually.

Your data and settings are saved in your own browser only. Other users do not see your changes, and a different browser or computer starts empty. Use **Export All Data to CSV** to back up or share your data.

## Using the calendar

- **Show** filters above the calendar hide or show Critical, Warning, Vacations and Holidays. They only change what is displayed; the dashboard numbers are not affected.
- **Month** view shows up to 5 items per day (critical first, then leave, then warnings), with a "+N more" link for the rest. Days are shaded by their worst status.
- **Week** view lists every item day by day.
- Hover over any item for details, such as which team is short and who is on leave.
- **Export PDF** and **Export Excel** include the statuses ticked under **Show** (Critical and/or Warning) for the chosen export period. Start and End Date appear only when **Custom Range** is selected.

## Calendar conventions

- **Leave events:** the event title must contain the employee's name exactly as it appears in the Employees tab (not case-sensitive), for example `Vacation Jane Doe`. Events without a name cannot be matched to anyone.
- **Holiday events:** start the title with 3-letter country codes, a hyphen, then the holiday name, for example `USA - Thanksgiving` or `ESP, FRA - All Saints Day`. Everyone whose country matches is counted as unavailable.
- **Country public holidays:** the app also tries Google's public holiday calendar for each employee country code. These only work where the code matches Google's calendar naming, so keep important holidays in your own holiday calendar.
- Every day of the week is treated as a working day, including weekends.

## Warnings banner

A yellow or red banner above the calendar means the data shown is incomplete:

| Message | What to do |
|---|---|
| Not connected to Google Calendar | Click **Connect Google Calendar**. The connection is not kept after a page reload. |
| Connection has expired | Click **Refresh Connection**. Google sign-ins last about 1 hour. |
| Could not read calendar "X" | You may have lost access to that calendar. Check it in Google Calendar or untick it. |
| A saved leave calendar is no longer in your list | The calendar was deleted, replaced or unshared. Untick the "Unknown calendar" row and tick the current one. |
| No leave calendar is selected | Tick at least one calendar under Leave Calendars. |
| Google Calendar could not start | The Google connection is not available from this web address. See Troubleshooting. |

## Troubleshooting

- **Recent leave is missing:** press Ctrl+Shift+R, click **Refresh Connection**, and check that the right calendars are ticked under Leave Calendars.
- **No "Connect Google Calendar" button:** open the browser console (F12) and look for errors. Google sign-in only works from the app's published web address, so a copy opened from your own computer will not connect.

## Testing changes

Because Google sign-in only works from the published address, test changes in a `test` folder in this repo before replacing the main files:

1. Copy `app.js`, `index.html` and `style.css` into `test/`, apply your changes there, commit and push.
2. Open the published app address with `test/` added to the end and check it.
3. When it works, copy the files from `test/` to the repo root, delete `test/`, commit and push.

The test page shares saved data with the main page in your browser (same web address).

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout |
| `app.js` | All logic: data, Google Calendar sync, coverage calculation, charts and exports |
| `style.css` | Custom styles |

Libraries (FullCalendar, Bootstrap, Chart.js, DataTables, Papa Parse, jsPDF, SheetJS) load from public CDNs, so there is no build step.
