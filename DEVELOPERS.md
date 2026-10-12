# OverEngineered Solar: how it works

This page is for people who want to know what the scripts do before trusting them, or who want to change something. You do not need any of it to install and use the widget. For that, see the [README](README.md).

Written for widget 2026.10.12.1613, setup 2026.10.12.0749 and dev sandbox 2026.10.12.1617.

Not affiliated with or endorsed by Enphase Energy, Inc.

## The short version

- Two scripts run in the Scriptable app on an iPhone. One is run by hand to set things up. The other draws the widget, on the Home Screen and, if you add it there, on the Lock Screen.
- A third script, the dev sandbox, shows the widget with made-up numbers. It is optional and touches nothing.
- The widget reads one home's data through Enphase's official API (version 4), using keys and a login that belong to the owner of that system.
- It only reads. It never changes anything on the system.
- It is built to stay inside the free plan's 1,000 requests a month, with a margin, without the owner having to think about it.
- Nothing is sent anywhere except Enphase and two free weather services. There is no server of mine in the middle.

## The two scripts

**`setup-overengineered-solar.js`** is run by hand from inside Scriptable. It shows its own pages, opens Enphase's sites inside the same window, and saves two files in Scriptable's local storage on the phone:

| File | What it holds |
|---|---|
| `overengineered-solar-config.json` | The settings from the setup form, plus the application's API Key, Client ID and Client Secret. |
| `overengineered-solar-token.json` | The Enphase login tokens for the owner's system. |

When settings are saved over existing ones, the old settings file is kept as a dated backup beside it.

**`widget-overengineered-solar.js`** is the widget. It reads those two files and never asks the user anything. If the settings are missing it shows "Run the setup script first". If Enphase no longer accepts the login it shows "Reauth needed".

**`dev-sandbox-overengineered-solar.js`** is for looking and experimenting. It reads none of these files and makes no requests. See "The layout, and how it was tested" below.

The widget keeps its own working data in one more file, `overengineered-solar-data/state.json`. That holds the last readings, the request counts, the daily history, the list of recent peaks, and the last weather report. Deleting it is safe: the widget rebuilds it, at the cost of a few extra requests and a few days before the dirty-panel check has enough clear days again.

## What it asks Enphase for

Every request goes to `api.enphaseenergy.com` with the owner's access token and the application's API key.

| Request | What it is used for | How often |
|---|---|---|
| `telemetry/production_meter` | The last 24 hours of production in 15-minute steps. Feeds the Past 24 Hours number, current power, and the power curve. | About hourly while the sun is up. |
| `telemetry/consumption_meter` | The same for consumption. | Every two hours, and hourly near the start and end of the day when the month has requests to spare. |
| `energy_lifetime` | One production total per day since the turn-on date. Feeds the 30-day average, the trend line and the banked-credit estimate. | Once a day. |
| `consumption_lifetime` | One consumption total per day. Same uses. | Once a day. |
| `open_events` | Whether Enphase is reporting a hardware fault. | Once a day. |
| `oauth/token` | Renews the access token. | About once a day. The widget does not include it in its request count. |

Setup makes two more kinds of request, once: the token exchange after the owner taps Authorize, and `systems`, to find the system ID that belongs to the login.

If the system has no consumption meters, setup can be told so. The widget then uses the owner's own daily estimate and never requests consumption at all.

If a request fails, the widget falls back to what it last saved and shows the time in orange. In daylight the time also turns orange when the newest reading is more than two hours old, whatever the reason, so old numbers never look current. That holds for each piece on its own: a failed consumption request does not throw away production that was just fetched, and a failed history request leaves the last good history in place.

## How it stays under 1,000 requests a month

The free plan allows 1,000 requests a month. That is about 33 a day, and a single refresh can need two.

- **Every request is counted.** The count for today and for the month is saved before each request goes out, so a failed request still counts.
- **The month is planned to 950 and stops hard at 990.** The widget itself also has a ceiling of 34 requests in one day.
- **The basics are reserved first.** For each remaining day of the month, the widget sets aside what that day needs at minimum: the three daily history requests, production once per daylight hour, and eight consumption requests. Daylight hours come from the date and the latitude, so a June day reserves more than a December day.
- **Whatever is left over is spread across the remaining days** and spent on extra consumption readings, in the early morning and the evening, when consumption changes the most. A month with plenty to spare gets hourly consumption for more of the day. A tight month gets it for less, or not at all.
- **Nothing is requested between 10 PM and 5 AM.**
- **A stalled Enphase feed is not chased.** Enphase's cloud sometimes sits on the same reading for hours. Whether a meter is due is judged from its newest reading, so during a stall every wake would look due. To stop that, a background run never fetches a meter sooner than 45 minutes after its last fetch, and while fetches bring nothing new the wait stretches to an hour (`MIN_REFETCH_GAP_MS`, `STALL_MAX_GAP_MS`). A stall then costs no more than a normal day, and the widget catches up within the hour once Enphase does. Before this rule, a three-hour stall used up a whole day's requests by mid-morning.
- **A failed history fetch is not retried on every run.** The last good history is shown, and background runs wait three hours before trying again, so a long Enphase outage cannot use up the day.
- **A new install mid-month assumes the worst.** If the widget has no count for the days before it was installed, it assumes 32 requests were used on each of them.
- **Running the script by hand costs requests too.** A manual run inside Scriptable fetches fresh data, so it is allowed only when the month has a surplus. Otherwise it shows the saved data and says so.

## Why the numbers are a little behind

- **Enphase publishes each 15-minute reading before it is finished**, and completes it about ten minutes later. The widget waits for the finished reading before calling it "current power". An unfinished reading looks like a sudden drop in power, which is wrong.
- **Requests are timed to the data, not the clock.** The widget works out when four new 15-minute readings will exist (plus four minutes for Enphase's cloud to catch up) and asks iOS to wake it then. Asking sooner would spend a request on data it already has.
- **iOS decides when a widget really runs.** For data, the widget never asks to be woken sooner than 50 minutes ahead, and iOS is often late on top of that.
- **The icon gets its own run.** In daylight the widget also asks for one run half-way between data runs, only to refresh the weather icon. That run makes no Enphase request, because fetches are decided by how many new readings exist, not by how often the widget runs.

The time in the widget's top right corner is the time of the newest reading, not the time the widget last ran.

## How each number is worked out

**Past 24 Hours.** The sum of the 15-minute readings ending now. It is a rolling window, not "since midnight".

**The 30-day number.** The average of the daily production totals over the last 30 days, leaving out days with no reading. It is green when that average is at least the 30-day average of consumption.

**Banked credits.** This is an estimate, not a reading from the utility. It starts from the balance and date the owner types in from a bill, adds production minus consumption for every full day since, and then adds today so far. From midnight until the first production fetch of the day, production counts as zero, so the night's consumption comes off the bank as each consumption reading arrives. Days where either number is missing are left out instead of being counted as zero. The small mark beside the label is the average daily net over the last 28 days: up above 5 kWh a day, down below minus 5, flat in between.

**Net.** Production minus consumption over the same 24 hours. It is worked out from the two numbers as shown, so the three always agree on the widget.

**Exported and Imported.** An optional setting shows these in place of Cons. A day's production minus its consumption cannot give them: a sunny morning and a hungry evening cancel out. So the two meters are compared one 15-minute reading at a time, from readings the widget already has. Where more was made than used, the difference counts as exported; where less, as imported. After dark, when production is no longer fetched, it counts as zero. In daylight consumption can be an hour or two behind production, and those newest readings wait until their consumption arrives. Three cautions: it reads a little lower than a utility meter, which does not wait 15 minutes to net things out; with a home battery it is not grid flow at all; and without consumption meters it cannot be worked out, so Cons is shown. When these two are on show, Net is their difference.

**Decimals.** Numbers under 10 show one decimal, because a small number rounded to a whole kWh hides too much. The bank and Net are always whole: one is an estimate and the other is the difference of two measurements, so a decimal there would claim more accuracy than the number has.

**No kWh bank.** If the owner's utility pays for exports in money instead of banking kWh (net billing, such as California NEM 3), a setup switch turns the bank into "Net Since" a chosen date. It is the same running total with a zero start and an honest label.

**Service Req.** Shown when `open_events` lists one of a fixed set of event types that mean a real hardware fault. Routine events are ignored.

## The Lock Screen widget

The same script also draws a small widget for the iPhone Lock Screen. (In the code it is called the "tile": `createLockTile`, `drawLockTile`, `IS_LOCK_TILE`.) Scriptable tells the script which size it is being drawn at; for the wide Lock Screen size the script draws three lines of text and nothing else:

- **Today**: production since local midnight.
- **Peak**: the highest 15-minute reading since midnight, in kW.
- **Net**: production minus consumption since midnight.

These count from midnight on purpose. The Home Screen widget shows a rolling 24 hours, which works there because it is labelled and sits beside its own 24-hour curve. A widget this small has no room for that, and a 24-hour number before breakfast reads as wrong.

The Lock Screen widget uses the readings already saved for the Home Screen widget. Whether to fetch is decided by how old those readings are, so a second widget does not add Enphase requests. Just after midnight it reads zero until the first fetch of the day; if nothing has come in by the afternoon, Today and Net show "--" so that a missing number is not mistaken for a reading, and Peak falls back to the highest reading of the last 24 hours.

A thin bar runs down the left edge so the numbers do not float on the wallpaper. On the right are the time of the newest reading and the weather icon, drawn as an outline. It is the same icon the Home Screen widget shows, including the rule that a busy array proves the sun is out.

iOS draws Lock Screen widgets in one tint, so there is no green or orange. The real thing is also narrower than Scriptable's in-app preview (about 143 points of usable width), so the sizes were settled on a real Lock Screen with the widest numbers. The three numbers share one size, because iOS shrinks each line of text separately and mismatched sizes look wrong. `lockValueSize` estimates the width of each line, unit included, and picks the largest of 14, 13, 12 or 11 points at which the widest one fits in the room left beside the label column (`LOCK_LABEL_WIDTH`, `LOCK_VALUE_ROOM`). Both constants were set from a real phone, where "+12 kWh" was once cut off. The unit is drawn as its own smaller text.

iOS runs each widget on its own timetable, so without help the Lock Screen widget can sit an hour behind the Home Screen one even though newer numbers are already saved. It therefore asks to be run every 15 minutes outside quiet hours (`LOCK_TILE_WAKE_MS`). Those runs find nothing due, make no Enphase request and redraw from what is saved. A Lock Screen run never writes the saved wake plan, so it cannot push the Home Screen widget's next data run back.

## The dirty-panel check

The idea: on a clear day, a clean array reaches about the same peak power as it did on the last clear day. If clear-day peaks drift down, the likely cause is dirt.

1. **Only clear days count.** After 4 PM, today's peak is recorded only if the weather report says clear to partly cloudy, and the day's energy is at least three hours' worth of that peak. The second test throws out a cloudy day with one bright spike.
2. **The last five clear-day peaks are kept.** The number on the widget is the second highest of the five. Using the second highest ignores a single freak reading.
3. **That number is compared to a ceiling.** The ceiling starts as the "Peak AC power" the owner entered in setup. It rises if the array later proves it can do more (up to 5% above the entered figure), and it fades by 0.3% a year to allow for normal panel aging.
4. **The verdict.** Within 10% of the ceiling reads **Max Power**. From 10% to 16% under reads **Dirty**. 16% or more under reads **Very Dirty**.
5. **Winter is left out.** When the midday sun is too low for the panels' tilt, a clean array cannot reach its summer peak, so comparing would give false alarms. The widget works this out from the latitude, the tilt and the date. During that part of the year it stops recording peaks, shows **Winter Sun**, and holds the last real number until spring.

A reading more than 5% above the entered peak is treated as a glitch and not recorded.

## Weather

The ZIP code is turned into coordinates once, by Zippopotam.us, and saved. Owners outside the US leave the ZIP empty and type a latitude and longitude in setup (`weatherLat`, `weatherLon` in the settings file), which is used as it is; a ZIP wins if both are set. Open-Meteo then gives the current conditions, cloud cover, sunrise and sunset. That is used for the icon, for deciding whether the sun is up, and for the clear-day test above. With neither, there is no weather icon and the widget gives no Dirty or Very Dirty verdict, because the Winter Sun check needs a latitude. If the weather services cannot be reached, the widget carries on with the last report it has.

The weather service describes the area around the ZIP code, not one roof, and can be wrong about a hilltop or a valley. So one rule lets the panels overrule it: when the array is at 85% or more of its expected peak, the icon is the bright sun whatever the service says. It only ever corrects toward sunny. The clear-day test for the dirty-panel check still uses the service's own reading.

## Login and keys

- Setup uses Enphase's standard OAuth login. The owner signs in on Enphase's own page and taps Authorize. The scripts never see the password.
- The access token lasts about a day. The widget renews it about an hour before it runs out and saves the new tokens.
- If a renewal fails because the phone was offline, the widget keeps using the token it has and tries again next run. It asks the owner to log in again only when Enphase has actually refused the login and the old token has run out.
- The keys and tokens are stored in plain files in Scriptable's local storage on the phone. They are not synced to iCloud by these scripts and are never sent anywhere but Enphase.
- Reports that the scripts copy to the clipboard show only the last four characters of any key or token.

## The layout, and how it was tested

A medium widget is a small fixed box, and this one carries a lot: six numbers, four headings, two charts, an icon and a time. Most of the work on the look went into keeping that readable instead of bunched up.

Scriptable's layout is less flexible than it looks. A few things that shaped the design:

- **Text that does not fit is cut off without any warning.** There is no error. The number just loses its end.
- **Columns do not share space on their own.** Two columns side by side only line up if each is given a fixed width, so the four boxes are fixed at the same width and everything inside has to fit that.
- **The numbers change length.** A small array shows 16 where a large one shows 250. A bank can be 9 or 9,999, and it can go negative. A layout that looks right with one set of numbers can break with another.

So the layout was tested with made-up numbers, not by waiting for real ones. There is a second reason for that. Every run of the real widget inside Scriptable fetches fresh data, and each fetch comes out of the 1,000 requests for the month. Trying a dozen layout changes on the real widget can cost a day's worth of requests. A test script with made-up numbers costs none. That script used the same drawing code and fed it one set of values after another: small, typical and large arrays, the widest numbers each box can hold, a negative bank, every status word, and trend lines of different shapes. Each screen was checked on a real phone, because a preview on a computer does not match what iOS draws.

That testing is why a few things are the way they are:

- The big numbers drop to a smaller size once they get long. The banked number shrinks at five characters, and the 30-day number at four characters or at 200 and above.
- The unit beside the 30-day number is the short "kWh/d".
- The widest values the layout was checked with are 250 kWh for production, consumption and the 30-day average, and 9,999 kWh either way for the bank. Beyond that, expect something to be cut off.

If you change the layout, test it the same way. A dev sandbox script is included for that: `dev-sandbox-overengineered-solar.js`. Paste it into Scriptable and run it. It needs no settings and no Enphase account, and it never goes online.

- It carries the widget's own code, copied in by a build script, so a screen in the sandbox is drawn exactly as the real widget draws it.
- At the bottom is a table of made-up days, one row per screen: array sizes from 1.6 to 25 kW, clear and cloudy skies, day and night, a dirty array, a deficit, a hardware fault, the Exported and Imported setting, a failed refresh, the error screen and the Lock Screen widget.
- A row only describes the day (array size, time, sky, consumption, averages, bank). Production is added up from the curve, so the big number, the chart and the Lock Screen widget always agree.
- Twenty-one screens is a lot to tap through. A switch at the top, `SHOW_ONLY`, takes a list of row numbers and shows just those.
- To try your own day, copy a row and change a number. To try a layout change, edit the drawing code in the sandbox and run it; when you like it, make the same edit in the widget.
- Placed on the Home Screen or Lock Screen as a widget, it shows one row. A row number in the widget's Parameter box picks which.

The drawing itself is in two functions that only draw what they are handed and make no requests: `createWidget(rollingResult, historyResult, peakStats, weatherIcon)` for the Home Screen and `drawLockTile(tx, iconName)` for the Lock Screen.

## Changing things

Run the widget script inside Scriptable (tap it in the list) to get a debug report. It opens with the widget version, the time and the phone, then any problems found on that run and what to do about them. After that come what was fetched, what came from saved data, the request counts for the day and month, the last few weather readings beside the array's power at the time, how the dirty-panel check reached its verdict, and what the Lock Screen widget would show. Two lines answer "where did today's requests go?": **Runs today** counts the Home Screen, Lock Screen and app runs and lists every run that made a request, and **Feed** shows how old Enphase's newest reading is, when it was last fetched, and when the next background fetch is allowed. The report is copied to the clipboard and is safe to paste into an issue: keys, tokens and the system ID show only their last four characters.

The values people most often want to adjust are constants near the top of the widget script:

| Constant | What it does | Value |
|---|---|---|
| `QUIET_START_HOUR`, `QUIET_END_HOUR` | No requests between these hours. | 22, 5 |
| `MONTH_ALLOWANCE`, `MONTH_HARD_STOP` | The monthly plan and the hard stop. | 950, 990 |
| `PEAK_ORANGE_PCT`, `PEAK_RED_PCT` | How far under the ceiling counts as Dirty and Very Dirty. | 10, 16 |
| `PEAK_ANNUAL_DECAY_PCT` | Yearly allowance for panel aging. | 0.3 |
| `GATE2_COS_CUTOFF` | How low the sun may get before Winter Sun starts. | 0.88 |
| `SHOW_LATEST_KW` | Shows the newest power reading in small text beside the "Array Status" heading. Off, because it is one more number to explain. | false |

Be careful with the request settings. Going over Enphase's limit means no new data for the rest of the month.

The setup script in this repository is a single built file with its two pages inside it. It can be edited directly.

The dev sandbox is a built file too. It holds a copy of the widget's code from the version named in its header, so a change made in the widget does not appear in the sandbox by itself, and the other way round. Make the edit in both.

## Limits worth knowing

- One system per install. If a login owns more than one system, setup says so and the system ID has to be checked by hand.
- Location is a US ZIP code, or a typed latitude and longitude anywhere else. The second path has not been run on a real system outside the US. The sun-angle maths works on both sides of the equator as long as the panels face the midday sun.
- Banked credits are an estimate. Utilities differ in how they count and when they reset, so the number drifts and should be corrected from a bill now and then.
- With a home battery, some energy is lost passing through it, so the bank and Net read a little high.
- The dirty-panel check assumes one array at one tilt. An array spread over several roof faces will reach Winter Sun at a different time than the widget expects.
- The setup script reads the three keys off Enphase's developer page by their labels. If Enphase changes that page, the keys can still be typed in by hand.

## License

PolyForm Noncommercial 1.0.0. See [LICENSE.md](LICENSE.md). Personal and other noncommercial use is free. Commercial use needs permission; open an issue to ask.
