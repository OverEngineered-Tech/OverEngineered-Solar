# Changelog

Versions are date stamps: `[year.month.day.time]`. Each script carries its own stamp on its first line.

## Widget (`widget-overengineered-solar.js`)

- **2026.10.12.1613** — Two runs a few minutes apart, too soon for a new reading, no longer count as "Enphase has nothing new", so they don't push back the next update.
- **2026.10.12.1609** — Fixed: when Enphase's cloud got stuck on one reading for hours, every wake of the widget looked due for new data, and it could use up its whole day of requests in about an hour, then freeze until midnight. Now each meter waits at least 45 minutes between fetches, and up to an hour while Enphase has nothing new, so a stalled feed costs no more than a normal day and the widget catches up within the hour once Enphase does. In daylight the time turns orange when the newest reading is more than 2 hours old, so old numbers never look current. The debug report now lists today's runs (Home Screen, Lock Screen, app) and which ones made requests, plus a line on how fresh Enphase's data is.
- **2026.10.08.1256** — Fixed: on the Lock Screen widget the time could still be cut off ("12:0...") when Net had a decimal, such as "+4.7 kWh". The numbers now step down a size a little sooner, and the time may shrink slightly to fit.
- **2026.10.07.1314** — The report you get by running the widget inside Scriptable is now called the debug report, the same name setup uses. Nothing in it changed.
- **2026.10.07.1241** — Fixed: on the Lock Screen widget the time could be cut off ("12:3..."). It is slightly smaller now.
- **2026.10.07.1236** — Fixed: on the Lock Screen widget a number could be cut off ("+..."), seen with a Net of "+12 kWh". The label column is narrower and the shared number size is now picked so the widest line fits.
- **2026.10.07.1022** — New: owners outside the US can enter a latitude and longitude in setup in place of a ZIP code. The widget then shows the weather icon and runs the dirty-panel check as it does with a ZIP. Not yet tested outside the US.
- **2026.10.07.1015** — Lock Screen widget: the three numbers are now always the same size, with smaller units beside them, and it asks iOS for a refresh every 15 minutes outside quiet hours so it keeps up with the Home Screen widget. Those refreshes make no Enphase requests. Changed: with no ZIP code saved, the widget no longer gives a Dirty or Very Dirty verdict, because without a location it cannot tell dirt from a low winter sun. The number shows as Max Power, and the status report says the check is off.
- **2026.10.07.0805** — New: the "Show Exported / Imported" setting now works. Switched on, the top left box shows energy sent to the grid and taken from it in place of Cons, worked out from 15-minute readings the widget already has. Off by default. Also added, switched off in the code: a small label for the newest power reading beside "Array Status".
- **2026.10.07.0710** — Comments in the code shortened. No change in behavior.
- **2026.10.07.0705** — The banked balance now counts overnight consumption as the night goes on; before, it held yesterday's closing figure until the first production fetch after sunrise. New: a small Lock Screen tile. Add the same script to the Lock Screen in the wide size and it shows three numbers counted from midnight: today's production, today's peak power and today's net, with the time of the newest reading and the weather icon beside them. It uses the numbers the home-screen widget already has, so it adds no Enphase requests. The status report says what the tile would show.
- **2026.10.06.1550** — If consumption cannot be fetched but production can, the fresh production is now shown with the last good consumption (time in orange) instead of both staying old.
- **2026.10.06.1310** — Net is now worked out from the Prod and Cons numbers as shown, so the three always agree.
- **2026.10.06.1225** — When the array is running near its peak, the icon is the bright sun even if the weather service says cloudy. The status report says which icon was shown and why.
- **2026.10.06.1215** — Sturdier when Enphase or the connection fails: a bad reply to the once-a-day history request is no longer saved, and the widget keeps showing its last good numbers (time in orange) instead of an error screen. The error screen is in plain language and says what to check. The status report opens with the widget version, time and phone, lists any problems first, and masks the system ID. The weather icon refreshes about every half hour in daylight at no cost in Enphase requests. Numbers under 10 show one decimal (the bottom-left box stays whole). New setting for utilities that do not bank kWh: the bottom-left box reads "Net Since" with your date. The report lists recent weather readings beside the array's power.
- **2026.10.06.0745** — Short comments added through the code explaining why each part works the way it does. No change in behavior.
- **2026.10.06.0715** — The top right heading now reads "30-Day Avg Prod", so the number says what it is. A tap on the widget opens the Enphase app through Enphase's own app link, with no shortcut needed. Source link in the header points at this repository.
- **2026.10.05.1740** — File renamed to `widget-overengineered-solar.js`. In winter, when the sun is too low to judge the panels, the max power number now holds its last real value under the "Winter Sun" label, and the list of clear-day peaks is paused until spring.
- **2026.10.04.2022** — Header now carries the project name, the license's Required Notice line, and source and support links. No change in behavior.
- **2026.10.03.1650** — License header added. Comments moved out of the code. Unused bar-chart drawing code removed. No change in behavior.
- **2026.10.03.1625** — Reads all settings from the file the setup script saves; nothing personal is in the code. Login tokens live in one shared file. Separate messages for "Run the setup script first", "Reauth needed" and "Something went wrong". The placeholder Exported/Imported view was removed.
- **2026.10.02.1335** — "Current power" ignores a reading less than 10 minutes old, because Enphase has not finished it yet.
- **2026.10.02.1318** — Bank trend mark: a small triangle or dash after "Banked Credits" showing the 28-day direction.
- **2026.10.02.1117** — Consumption is fetched hourly at both ends of the day when the month has requests to spare.
- **2026.10.02.1050** — Consumption is fetched together with production during the day, so the two stay in step.
- **2026.10.02.0740** — Monthly request budget: the widget plans the month so it stays under Enphase's 1,000-request limit.
- **2026.10.01** — Production and consumption on separate schedules. The power curve ends at the latest reading. No dashed line at zero power. High thin cloud shows the partly-cloudy icon.

## Dev sandbox (`dev-sandbox-overengineered-solar.js`)

- **2026.10.12.1617** — Rebuilt from widget 2026.10.12.1613. The new "time turns orange after 2 hours" rule is switched off here, because the sandbox's times of day are pretend; the "refresh failed" screen still shows the orange time.
- **2026.10.08.1256** — Rebuilt from widget 2026.10.08.1256.
- **2026.10.07.1314** — Rebuilt from widget 2026.10.07.1314.
- **2026.10.07.1241** — Rebuilt from widget 2026.10.07.1241 (Lock Screen cut-off fixes).
- **2026.10.07.1028** — Rebuilt from widget 2026.10.07.1022, so the Lock Screen screens show the numbers at one size with smaller units. One more screen: a Lock Screen day with a large deficit, the widest numbers it has to hold. 21 screens.
- **2026.10.07.0806** — New. Shows the widget and the Lock Screen tile with made-up numbers, one screen after another, for seeing it before setup and for trying changes. It carries the code of widget 2026.10.07.0805.

## Setup (`setup-overengineered-solar.js`)

- **2026.10.12.0749** — On-screen instructions and messages now say to tap Close at the top left, the name Scriptable gives that button, instead of an X. The Save button now visibly presses in when tapped, and after a successful save it reads "Saved" in a darker green until something is changed.
- **2026.10.07.1025** — New box "Outside the US": latitude and longitude, used when the ZIP code is empty. Setup checks the two numbers and says so if they look swapped. With neither a ZIP nor a latitude and longitude, it warns that the weather icon and dirty-panel warning will be off.
- **2026.10.07.0745** — The hint under "Show Exported / Imported" now says what the setting does. The setting itself was already there; the widget now acts on it.
- **2026.10.06.1215** — New switch, "My utility banks kWh credits". Off means no balance is asked for, only a date to count net energy from.
- **2026.10.06.0750** — Short comments added through the code explaining why each part works the way it does. No change in behavior.
- **2026.10.06.0720** — The "Tap widget to open Enphase app" switch and the shortcut note are gone from the form, because the widget no longer needs a shortcut. Source link in the header points at this repository.
- **2026.10.05.1740** — File renamed to `setup-overengineered-solar.js`. The "Get your keys" steps on the first screen now match Enphase's developer site step by step (Sign Up, the activation email, Applications, Create new application, Create Application, waiting for the keys).
- **2026.10.04.2022** — Header now carries the project name, the license's Required Notice line, and source and support links. No change in behavior.
- **2026.10.04.1952** — One error message reworded. No change in behavior.
- **2026.10.03.1650** — License header added. Comments moved out of the code. Debug report retitled.
- **2026.10.03.1550** — Saved files renamed to `overengineered-solar-config.json` and `overengineered-solar-token.json`.
- **2026.10.03.1250** — Rebuilt around two pages: "Connect to Enphase" and a single settings form. Enphase's site opens inside the script. Keys are read from the developer page, and the authorization code is picked up automatically.

## Guide (`README.md` and the printable guide)

- **2026.10.12.1620** — README and DEVELOPERS.md: version lines for widget 2026.10.12.1613, setup 2026.10.12.0749 and dev sandbox 2026.10.12.1617; the orange time now also means "more than 2 hours old"; how the widget handles a stalled Enphase feed; the new debug-report lines. The printable PDF was not rebuilt and still describes widget 2026.10.08.1256 and setup 2026.10.07.1025 (its steps still say the ✕).
- **2026.10.12.0749** — README only: "the ✕" is now "Close" in the three places that name the button at the top left of Scriptable's web page (written for setup 2026.10.12.0749). The printable PDF and Word guide still say ✕ until they are rebuilt.
- **2026.10.08.1256** — Version line only, for widget 2026.10.08.1256.
- **2026.10.08.0632** — Banked Credits now says the estimate can drift by about 2% of a month's usage from the utility's meter, and that updating the balance from each bill keeps it close.
- **2026.10.07.1709** — Install step 8 no longer asks you to choose a size; the widget drops in at the right one.
- **2026.10.07.1639** — New picture of the Lock Screen widget, showing the numbers with their smaller units.
- **2026.10.07.1314** — "Status report" is now "debug report" throughout.
- **2026.10.07.1241** — Version line only, for widget 2026.10.07.1241.
- **2026.10.07.1028** — "Lock Screen widget" and "Home Screen widget" are now used throughout, matching Apple's names (earlier entries here still say "tile"). The settings table has a new "Outside the US" row for latitude and longitude, and says what is lost with no location. The Lock Screen section notes the 15-minute refresh.
- **2026.10.07.0812** — New at the top: what this adds to the Enphase app. New sections for the Lock Screen tile, with a picture, and for the dev sandbox. "Show Exported / Imported" is described under Past 24 Hours and in the settings table. Banked Credits notes that the balance moves overnight. "Get your keys" now says the activation link opens in Safari and that you sign in back in Scriptable. A short "How it works" section points to the developer page, which is now published.
- **2026.10.06.1550** — Version line updated for widget 2026.10.06.1550.
- **2026.10.06.1310** — Version line updated for widget 2026.10.06.1310.
- **2026.10.06.1225** — Title row mentions the sun icon at peak power. Version line updated.
- **2026.10.06.1215** — Notes for battery owners and for net billing (such as California NEM 3). The new setup switch and the new "No data from Enphase yet" message are listed. Debugging says how to send a status report.
- **2026.10.06.0755** — Support section says the widget is shared as it is, and invites people to say whether it helped.
- **2026.10.06.0750** — Version line updated for widget 2026.10.06.0745 and setup 2026.10.06.0750.
- **2026.10.06.0730** — The readme now opens with a real picture of the widget in place of the text drawing, and the printable guide has a new one. "The tap shortcut" section removed: a tap on the widget now opens the Enphase app with nothing to set up. The top right box is described under its new heading, "30-Day Avg Prod". The Array Status label is explained more plainly.
- **2026.10.05.2013** — Corrected how to name a script in Scriptable (tap Done first, then press and hold the script and choose Rename). Setup says to tap the script in the list to run it. The printable guide link opens the PDF directly. The tap-shortcut instructions cover both the older and the newer Shortcuts app.
- **2026.10.05.1910** — Added a picture showing where to tap on GitHub to copy a script, and a recommendation at the start of Install to print the printable guide first.
- **2026.10.05.1745** — Says plainly that everything runs on the iPhone; step-by-step copying of the scripts from GitHub on a phone; the update rate; file names changed so the first word says what each file is.
- **2026.10.04.2025** — Updated for widget and setup 2026.10.04.2022.
- **2026.10.04.1955** — Pictures of the Enphase developer site, corrected sign-up steps, plain-language license summary, Support section, printable PDF.
