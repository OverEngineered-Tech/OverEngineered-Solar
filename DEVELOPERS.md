# OverEngineered Solar: how it works

This page is for people who want to know what the scripts do before trusting them, or who want to change something. You do not need any of it to install and use the widget. For that, see the [README](README.md).

Written for widget 2026.10.28.1117, setup 2026.10.28.0956 and dev sandbox 2026.10.29.1150.

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
| `telemetry/production_meter` | The last 24 hours of production in 15-minute steps. Feeds the Past 24 Hours number, current power, and the power curve. | About hourly while the sun is up, plus one more request about 30 minutes after sunset to pick up the last readings of the day (`PROD_TAIL_AFTER_SUNSET_MS`). |
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

**The 30-day number.** The average of the daily production totals over the last 30 days, leaving out days with no reading. It is green when that average is at least the 30-day average of consumption. The heading reads "30d Prod vs Use" because the box beside it draws each of the 30 days against that same consumption average (the dashed line, drawn like the reference lines on the other two charts): days at or above it are green, days below it orange.

**Banked credits.** This is an estimate, not a reading from the utility. It starts from the balance and date the owner types in from a bill, adds production minus consumption for every full day since, and then adds today so far. From midnight until the first production fetch of the day, production counts as zero, so the night's consumption comes off the bank as each consumption reading arrives. Days where either number is missing are left out instead of being counted as zero. The debug report also gives the average daily net over the last 28 days (up above 5 kWh a day, down below minus 5, flat in between). Up to widget 1220 that showed as a small mark beside the label; it was dropped in 1255 because the 12-month bank chart already shows the direction. Since 2026.10.28.0958 the balance follows the bills: setup saves a bill day of the month (1 to 31; with none saved the day of the entered bill date is used, and with neither the plain running sum is used). On each bill day a bank below zero goes back to zero and a positive bank stays. On the bill day of the true-up month the credits left over are forfeited, so the bank goes to zero. A short month uses its last day. The 12-month bank line follows the same rules, and the debug report has a "Bank rule" line. These rules are an assumption about how utilities treat the balance, not something Enphase reports, and they have not yet been seen through a real true-up month.

**Net.** Production minus consumption over the same 24 hours. It is worked out from the two numbers as shown, so the three always agree on the widget. Green at zero or above, orange below (`netColor`; the same rule colours the bank number).

**Today view.** `today` in a widget's Parameter box (`args.widgetParameter`, read into `VIEW_TODAY`) makes that widget's top-left numbers count from local midnight, on the medium and small sizes; the heading reads "Prod Today". Production and consumption since midnight are the same numbers the Lock Screen widget uses; Exported and Imported, if on, are counted from midnight too (`gridFlowWh` takes a start time). If the since-midnight numbers can't be worked out yet, the widget shows the past 24 hours with its own heading. Colours: part of a day can't be judged against a whole day's average, so Prod and Cons are compared with yesterday at the same time (`todayVsYesterday`). Yesterday up to this time is yesterday's whole-day total from the daily history (saved as `lastDayDate`, `lastDayProdWh`, `lastDayConsWh`) minus the 15-minute readings from this time yesterday to midnight, which the 24-hour readings already hold. "This time yesterday" is exactly 24 hours before the newest reading from today, where today's number stops too; when a meter has no reading from today yet (production overnight, which is not fetched and counts as zero), it is 24 hours before now, to the 15 minutes. Early in the day the readings still reach back to yesterday's midnight, so yesterday up to this time is added up from them directly instead. Enphase often sends 95 readings instead of 96, leaving out the one just after that point; that one 15-minute slice is filled with the reading beside it (off by a fraction of a kWh at most). With more than one missing there is no comparison for that update. Prod is green when at or ahead of it, Cons green when at or under it. Without a comparison both show green (`TODAY_NEUTRAL`): the day is most likely on track, and grey there wasn't obvious (the same call as Array Status before its first check). That happens each morning from midnight until the first daily history fetch after 5 AM, because yesterday's whole-day total isn't saved until then, and with a history saved by an older version; a history without `lastDayDate` is fetched once more, then daily as usual. Net keeps its usual colour. The debug report's "Today view" line shows the saved day and the comparison.

**Edges of the day.** A 15-minute reading is stamped with the time it ends, so the reading that ends exactly at midnight covers the last minutes of the day before and is not counted in today's figures. Production is only fetched while the sun is up, so the last readings before sunset would be missing until morning; one extra request about 30 minutes after sunset (once a day) picks them up. After dark, if the newest production reading is more than an hour old, the end of the power curve is drawn at 0 kW instead of the last daytime value (`NIGHT_KW_STALE_MS`).

**Exported and Imported.** An optional setting shows these in place of Cons. A day's production minus its consumption cannot give them: a sunny morning and a hungry evening cancel out. So the two meters are compared one 15-minute reading at a time, from readings the widget already has. Where more was made than used, the difference counts as exported; where less, as imported. After dark, when production is no longer fetched, it counts as zero. In daylight consumption can be an hour or two behind production, and those newest readings wait until their consumption arrives. Three cautions: it reads a little lower than a utility meter, which does not wait 15 minutes to net things out; with a home battery it is not grid flow at all; and without consumption meters it cannot be worked out, so Cons is shown. When these two are on show, Net is their difference.

**Decimals.** Numbers under 10 show one decimal, because a small number rounded to a whole kWh hides too much. The bank and Net are always whole: one is an estimate and the other is the difference of two measurements, so a decimal there would claim more accuracy than the number has.

**12-month bank chart.** On by default (setup switch; older settings files without it count as on). Worked out once a day from the same daily history as the bank, so it makes no requests of its own. From the bill date on, the line is the same running sum as the bank number. Before the bill date it is worked back from the bill, taking each day's net away again. Going back past a true-up (taken as the 1st of the true-up month) the balance before it can't be worked back, so that part is counted up from zero instead, never below zero. The line is one point every 14 days, ending on today's balance: weekly points sat about one per pixel in a 58-point-wide chart and drew weather wobble, not the shape, which on a small or break-even array can fill the box. The top of the box is the highest daily balance in the last 12 months (not just the plotted points), the bottom is zero or the lowest balance if lower, and the dotted line is today. Days before the turn-on date are blank, so a young system's line starts part way across. If there is too little history or any number is not sound, the box falls back to the original layout.

**Yesterday faded.** On the Array Status chart, the part of the curve before the midnight point is covered by a rectangle of the widget's background colour at 57% (`YESTERDAY_FADE`, the `dimBefore` / `dimAlpha` options of `renderMicroLineChart`), so today's part stands out. The midnight dot is drawn after it and stays bright. 57% was picked on a real phone from 35 to 65%, at several made-up times of day and after a cloudy day. Only this chart mixes two days, so the other two charts have no fade.

**Marker dots.** The three small charts have small dots on their bottom edge, with no axes or labels, for a sense of time: the start of each quarter (Jan, Apr, Jul, Oct 1) on the bank chart (`BANK_QUARTER_TICKS`, `bankChartQuarterTicks`), the 1st of the month on the 30-day box (`Q2_MONTH_DOT`, `monthStartIndexes`) and midnight on the Array Status chart. Each dot is a tick 1 point wide and 2 points tall, white at 40% (`BANK_TICK_HEIGHT`, `BANK_TICK_ALPHA`, shared by all three). The 30 daily totals end on the day before the history was fetched, so point k is a known number of days back and the dot is placed from that; it is left out when the 30 points are not 30 calendar days (a young system, or a day with no production), because it would land on the wrong date. A 30-day window holds one 1st, or two in some Februaries, or none. The midnight dot moves along the rolling 24-hour chart; it sits half a point before the first hour of the day, because each point is one hour ending at the fetch time. Labels were tried and dropped: at this size they were too small to read, and "12A" or month names depend on the phone's clock style and language, while a dot reads the same everywhere. A true-up marker was also dropped: the widget knows only the month, and net-billing owners have no true-up. Very faint vertical lines (white at 16%, drawn under the curve; `CHART_MARKER_ALPHA` and the `markers` option, still in the renderers but unused) were in widgets 0630 to 1600 and were replaced in 1750: on boxes this small they crossed the charts like a crosshair. Monthly dots on the bank chart and Sunday dots on the 30d box were tried and dropped as too busy.

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

## The Small widget

Added at the Small Home Screen size, the same script draws a compact layout (`createSmallWidget`, used when Scriptable reports the `small` widget family: `IS_SMALL`). It is drawn from the same fetched and saved data as the medium widget, so the numbers match, and the request budget is shared.

- **Title row:** the weather icon and the title. A title longer than 14 characters (`SMALL_TITLE_MAX`) is cut back to the whole words that fit, so "OverEngineered Solar" shows as "OverEngineered" at a readable size instead of shrinking.
- **Top:** the heading "Prod 24h" with the time of the newest reading, past-24-hour production at 30 points on the left (`SMALL_PROD_SIZE`), and Cons (or Exp and Imp) and Net on the right at the medium widget's Exp/Imp sizes (12-point numbers, 8-point labels). The colours follow the same rules as the medium widget.
- **Bottom:** the Array Status box, as on the medium widget.

Both sides of the top row have fixed widths (`SMALL_INNER_W` 134, `SMALL_VAL_W` 37, a 4-point gap, `SMALL_LABEL_W` 29; Prod gets the rest, 64 points). The label box cannot go below 29: at 27 "Cons" was cut to "Co...". Left to itself, iOS divided the row badly: a three-digit Cons or Net squeezed the Prod number to "2..." or to nothing. The sizes were settled on a real phone with made-up values from Prod 0.4 to 250, Cons 16 to 150 and Net -110 to 210.

Resizing a widget while editing the Home Screen switches between the medium and small layouts by itself, because iOS just runs the script again at the new size. The small widget always shows the past 24 hours; a since-midnight version was tried and parked.

## The dirty-panel check

The idea: on a clear day, a clean array reaches about the same peak power as it did on the last clear day. If clear-day peaks drift down, the likely cause is dirt.

1. **Only clear days count.** After 4 PM, today's peak is recorded only if the weather report says clear to partly cloudy, and the day's energy is at least three hours' worth of that peak. The second test throws out a cloudy day with one bright spike. One exception to the weather test: a day the weather report calls overcast still counts when its peak is at least as high as the best saved peak, because a high peak can never cause a false alarm, only low peaks can (thin high cloud can hide the sun from the report while the array runs at full power). The energy test still applies.
2. **The last five clear-day peaks are kept.** The number on the widget is the highest of the five, so it matches the peak the Enphase app shows. A freak reading is limited by the 5% glitch limit in the next step and drops out of the list after five days.
3. **That number is compared to a ceiling.** The ceiling starts as the "Peak AC power" the owner entered in setup. It rises if the array later proves it can do more (up to 5% above the entered figure), and it fades by 0.3% a year to allow for normal panel aging.
4. **The verdict.** Within 10% of the ceiling counts as healthy: the heading stays **Array Status** and the number is green. From 10% to 16% under reads **Array Dirty**. 16% or more under reads **Array Very Dirty**.
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

- The big numbers drop to a smaller size once they get long. The banked number shrinks at five characters (with the bank chart on: 22 up to four characters, 20 at five, 17 at six), and the 30-day number at four characters or at 200 and above.
- Text beside a flexible gap is never set to shrink-to-fit: iOS then shrinks or cuts it short even when it fits (seen as "53..." for 5,364).
- The unit under the 30-day number is the short "kWh/d", and the bank number has "kWh" under it when the bank chart is on. The 30-day line is framed in a 58 x 24 box like the two charts below it, so the three boxes line up.
- The top-left box is the hero: "Prod 24h" over a 30-point production number (`MEDIUM_PROD_SIZE`), with Cons and Net stacked beside it in fixed-width boxes (`Q1_VAL_W` 37, a 4-point gap, `Q1_LABEL_W` 29; Prod gets the remaining 63 points), the same layout as the small widget. Net used to sit on the bank label line. No unit under the production number: it crowded the box, and the other three boxes already say kWh.
- The Array Status number is set like the bank number (size 22, or 20 at five characters) with "Max kW" under it. When the check finds something, the heading itself becomes the condition ("Array Dirty", "Array Very Dirty", "Winter Sun", "Service Required") in the status colour, and the "Max kW" line stays.
- Warning colours are green, orange and a lighter red-orange (`#f2725f`) for the worst states, never a harsh dark red.
- The widest values the layout was checked with are 250 kWh for production, consumption and the 30-day average, and 9,999 kWh either way for the bank. Beyond that, expect something to be cut off.

If you change the layout, test it the same way. A dev sandbox script is included for that: `dev-sandbox-overengineered-solar.js`. Paste it into Scriptable and run it. It needs no settings and no Enphase account, and it never goes online.

- It carries the widget's own code, copied in by a build script, so a screen in the sandbox is drawn exactly as the real widget draws it.
- At the bottom is a table of made-up days, one row per screen: array sizes from 1.6 to 25 kW, clear and cloudy skies, day and night, a dirty array, a deficit, a hardware fault, the Exported and Imported setting, a failed refresh, the error screen and the Lock Screen widget.
- A row only describes the day (array size, time, sky, consumption, averages, bank). Production is added up from the curve, so the big number, the chart and the Lock Screen widget always agree.
- Twenty-one screens is a lot to tap through. A switch at the top, `SHOW_ONLY`, takes a list of row numbers and shows just those.
- To try your own day, copy a row and change a number. To try a layout change, edit the drawing code in the sandbox and run it; when you like it, make the same edit in the widget.
- Placed on the Home Screen or Lock Screen as a widget, it shows one row. A row number in the widget's Parameter box picks which.

The drawing itself is in three functions that only draw what they are handed and make no requests: `createWidget(rollingResult, historyResult, peakStats, weatherIcon)` for the medium Home Screen widget, `createSmallWidget` (same arguments) for the Small size, and `drawLockTile(tx, iconName)` for the Lock Screen. The dev sandbox (2026.10.12.1617) predates the Small size and does not show it yet.

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
| `PROD_TAIL_AFTER_SUNSET_MS`, `NIGHT_KW_STALE_MS` | How long after sunset the one extra production request is made, and how old a reading may be after dark before the curve ends at 0 kW. | 30 min, 1 h |
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
