# Customer Impact Calendar

A browser-based dashboard that shows when customers and regions are at risk of being understaffed, based on team members' vacations and public holidays from Google Calendar.

Live app: https://akpande-airnguru.github.io/Vacation_impact_calandar/

## How it works

1. You define **customers**, **regions** and **employees** (each employee has a country and a team).
2. Each customer or region has staffing **requirements**: which teams cover it and the minimum number of people needed.
3. The app reads leave and holidays from Google Calendar (read-only) and, for every day, counts who is available.
4. Each day is marked:
   - **Critical** (red): fewer people available than the minimum.
   - **Warning** (yellow): exactly the minimum available.
   - Covered days are not shown.

## Getting started

1. Open the live app and click **Connect Google Calendar** (under Integrations). Sign in with your Airnguru Google account and allow read-only calendar access.
2. Under **Leave Calendars**, tick every calendar that means a person is unavailable (normally **Vacations**).
3. Under **Official Holiday Calendar**, choose **Official holidays**.
4. Load your data with **Bulk Import from CSV** (use **Download CSV Template** for the format), or add items manually.

Your data and settings are saved in your own browser only. Other users do not see your changes, and a different browser or computer starts empty. Use **Export All Data to CSV** to back up or share your data.

## Calendar conventions

- **Vacation events:** the event title must contain the employee's name exactly as it appears in the Employees tab (not case-sensitive), for example `Vacations Akshay Pande`.
- **Official holiday events:** start the title with 3-letter country codes, a hyphen, then the holiday name, for example `IND - Diwali` or `CHI, PER - All Saints Day`. Everyone whose country matches is counted as unavailable.
- **Country public holidays:** the app also tries Google's public holiday calendar for each employee country code. These only work where the code matches Google's calendar naming, so rely on the Official holidays calendar for anything important.

## Warnings banner

A yellow or red banner above the calendar means the data shown is incomplete:

| Message | What to do |
|---|---|
| Not connected to Google Calendar | Click **Connect Google Calendar**. The connection is not kept after a page reload. |
| Connection has expired | Click **Refresh Connection**. Google sign-ins last about 1 hour. |
| Could not read calendar "X" | You may have lost access to that calendar. Check it in Google Calendar or untick it. |
| A saved leave calendar is no longer in your list | The calendar was deleted, replaced or unshared. Untick the "Unknown calendar" row and tick the current one. |
| No leave calendar is selected | Tick at least one calendar under Leave Calendars. |
| Google Calendar could not start | Usually the Google API key is blocking this web address. See Troubleshooting. |

## Troubleshooting

- **Recent vacations are missing:** press Ctrl+Shift+R, click **Refresh Connection**, and check that the right calendars are ticked under Leave Calendars.
- **No "Connect Google Calendar" button:** open the browser console (F12). A 403 "Permission denied" error means the Google API key only accepts requests from the GitHub Pages address, so the app will not work from other addresses such as localhost.

## Testing changes safely

The Google API key and sign-in only work on the GitHub Pages address, so test changes in a `test` folder in this repo before replacing the live files:

1. Copy `app.js`, `index.html` and `style.css` into `test/`, apply your changes there, commit and push.
2. Open https://akpande-airnguru.github.io/Vacation_impact_calandar/test/ and check it.
3. When it works, copy the files from `test/` to the repo root, delete `test/`, commit and push.

The test page shares saved data with the live page in your browser (same web address).

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout |
| `app.js` | All logic: data, Google Calendar sync, coverage calculation, charts and exports |
| `style.css` | Custom styles |

Libraries (FullCalendar, Bootstrap, Chart.js, DataTables, Papa Parse, jsPDF, SheetJS) load from public CDNs, so there is no build step.
