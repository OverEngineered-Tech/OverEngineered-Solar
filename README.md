# OverEngineered Solar

A home-screen widget for the Scriptable app on iPhone, for use with Enphase® solar systems.

Guide version 2026.10.05.2013. Written for widget 2026.10.05.1740 and setup 2026.10.05.1740.

**Everything here runs on your iPhone, inside the Scriptable app.** A computer is only useful for reading this guide and, if you like, creating the Enphase developer account.

**Setting it up?** Print the [printable guide](https://overengineered-tech.github.io/OverEngineered-Solar/Printable-Guide-OverEngineered-Solar.pdf) first, or open it on a second screen. Setup is easier with the steps and pictures beside you.

Not affiliated with or endorsed by Enphase Energy, Inc. Enphase is a registered trademark of Enphase Energy, Inc.

Licensed under the PolyForm Noncommercial License 1.0.0. Personal and other noncommercial use is free. Commercial use needs permission; open an issue to ask.

## What it shows

```
 ☀  OverEngineered Solar                    Oct 3, 2:30 PM
 Past 24 Hours                │  Past 30 Days
   146 Prod    137 Cons       │    112 kWh/d   [trend line]
 ─────────────────────────────┼─────────────────────────────
 Banked Credits ▲             │  Array Status
   5364    9 Net              │    24.5 kW     [power curve]
                              │    Max Power
```

**Title row.** A weather icon for your location, your title, and the time of the newest data, which tells you how fresh the numbers are. The time turns orange if the last update failed.

**Past 24 Hours.** Production and consumption over the last 24 hours, in kWh. This is a rolling window ending now, not "since midnight", so on two similar days the numbers stay steady.
- Prod is green when it is at or above your 30-day average production, orange when below.
- Cons is green when it is at or below your 30-day average consumption, orange when above.

**Past 30 Days.** Your average daily production over the last 30 days, with a 30-day trend line. Green means you are producing at least as much as you use, on average.

**Banked Credits.** Your running net-metering balance in kWh: the balance from your last bill, plus everything produced minus everything consumed since then.
- The small mark after the label shows which way the bank has been heading over the last 28 days: a green up triangle (adding more than about 5 kWh a day), an orange down triangle (drawing down more than about 5 kWh a day), or a grey dash (roughly flat).
- "Net" is production minus consumption for the same rolling 24 hours shown at the top left.
- If the estimate goes below zero the label reads "Credit Deficit".

**Array Status.** A health check and a chart.
- The chart is the last 24 hours of production. The right end is your current power. The dashed line marks the highest reading in the last hour.
- The number is your array's peak power across the last five clear days. The label under it is a verdict: **Max Power** (normal), **Dirty** or **Very Dirty** (clear-day peaks have dropped; the panels may need washing), **Winter Sun** (the sun is too low to judge, so the number holds its last real value until spring), or **Service Req** (Enphase is reporting a hardware fault).

Tap the widget to open the Enphase app (see "The tap shortcut" below).

## What you need

- An iPhone with the free [Scriptable](https://scriptable.app) app.
- An Enphase system and the login you use in the Enphase app.
- A free Enphase developer account. Setup walks you through creating one.

Consumption monitoring is optional. Without it, setup asks for a daily usage estimate.

## Install

[Scriptable](https://scriptable.app) is a free iPhone app that runs small scripts and can show one as a home-screen widget. This widget is two of those scripts: one you run once to set things up, and one that draws the widget.

**Recommended: print the [printable guide](https://overengineered-tech.github.io/OverEngineered-Solar/Printable-Guide-OverEngineered-Solar.pdf) before you start.** The link opens the guide as a PDF you can print or save. It has every step and picture on paper, so you can follow along while your phone is busy with the install.

Do all of this on your iPhone. The scripts have to be in Scriptable on the phone, and setup has to run there, because that is where it reads your keys and saves your settings.

1. Install **Scriptable** from the App Store.
2. In Safari on your iPhone, open this project's GitHub page and tap `setup-overengineered-solar.js` in the file list.
3. Tap the **⋯** at the right of the row that says **Code | Blame**, then tap **Copy** under “Raw file content”. The whole script is now copied.

   ![where to tap to copy a script](images/7-copy-script.png)

4. Open Scriptable and tap **+** at the top right. Paste, then tap **Done** at the top left.
5. Back in the script list, press and hold the new **Untitled Script**, tap **Rename**, and call it **OverEngineered Solar Setup**.
6. Go back to GitHub and do the same with `widget-overengineered-solar.js`: copy it, paste it into a new script, tap **Done**, then rename that one **OverEngineered Solar**.
7. In Scriptable, tap **OverEngineered Solar Setup** to run it (next section).
8. When setup is finished, add a medium Scriptable widget to your home screen, long-press it, choose **Edit Widget**, and pick **OverEngineered Solar** as the script.

The script names are suggestions. Any names work, as long as you can tell the two apart.

## Setup

In Scriptable, tap **OverEngineered Solar Setup** in the script list to run it. The first run has three parts.

**1. Get your keys.**

1. Tap **Open Enphase Developer Site**. If a cookie box appears, tap **Accept All Cookies**.
2. Tap **Sign Up**, the small link under the Sign In button.

   ![sign in](images/1-sign-in.png)

3. Fill in the form. **Organization/Group Name** and **Username** can be anything, such as “Home”.

   ![sign up](images/2-sign-up.png)

4. Enphase emails you an activation link. It comes from api@enphaseenergy.com with a subject starting “Action Required”; check spam if you don't see it. Tap the link. It opens a sign-in page. (A second tap says “already activated”, which is fine.)
5. Sign in. On the welcome page tap **Applications** in the menu at the top, not the big Quick Start button.

   ![after sign in](images/3-after-sign-in.png)

6. Tap **Create new application**.

   ![applications](images/4-applications.png)

7. Leave the plan on **Watt** (free). Name, Description and Developed By can be anything.
8. **Access Control: check every box.** They all start unchecked, and the widget can't read your data without them.

   ![new application](images/5-new-application.png)

9. Tap **Create Application**. After a moment the page reloads and shows your **API Key**, **Client ID** and **Client Secret**. Wait until you can see all three.

   ![your keys](images/6-your-keys.png)

10. Tap the ✕ at the top left. Setup reads the three keys for you. (You can also type them in.)

*Optional: the Enphase developer site is easier on a bigger screen. You can create the developer account and the application on a computer if you prefer. You still run setup on your iPhone afterwards and sign in there, and it reads the keys the same way.*

**2. Approve access.** Tap "Continue to Enphase login", log in with your normal Enphase account (not the developer one), tap Authorize, then tap the ✕. This lets the widget read your system. It cannot change anything.

**3. Fill in the form.** Your system ID is filled in for you. Enter the rest and tap Save, then the ✕.

| Setting | What to enter |
|---|---|
| System turn-on date | The day your system started producing. Data is counted from this day; pick a later date if your early data was wrong. |
| Peak AC power | The highest kW you have seen in the Enphase app. |
| Panel tilt | In degrees. Use 30 if unsure. |
| ZIP code | For weather, sunrise and sunset. |
| Banked credits | The kWh balance and date from your most recent bill, or 0. |
| True-up month | The month your utility resets banked credits. |
| Enphase shows consumption | On if the Enphase app shows consumption, not just production. |
| Title | The name shown on the widget. |

Run setup again any time to change a setting. It opens straight to the form with no login. The usual reason is a new banked-credit balance from a bill.

### The tap shortcut

This is optional. It makes a tap on the widget open the Enphase app.

In Apple's **Shortcuts** app, make a new shortcut with one action, **Open App**, set to the Enphase app (listed as **Enlighten**). Name the shortcut exactly `Open Enlighten`.

On newer iPhones you can type “Open the Enlighten app” in the **Describe a shortcut** box. The look of the Shortcuts app varies between iOS versions.

### Updating to a newer version

Paste the new code over the old script in Scriptable. Your settings and login are kept in separate files, so there is nothing to redo.

## Messages you might see

| On the widget | Meaning |
|---|---|
| Run the setup script first | No settings were found. Run setup. |
| Reauth needed | Enphase no longer accepts the saved login. Run setup and tap "Log in again". |
| Something went wrong | An unexpected error. Run the widget script inside Scriptable to see the details. |

## Why it isn't fully real time

The widget updates about once an hour while the sun is up (occasionally an hour and a quarter), every one to two hours in the evening, and not at all between 10 PM and 5 AM. The time in the top right corner is the time of the newest data, so it shows how fresh the numbers are. That pace is on purpose, and there are two reasons.

- **Enphase's free plan allows 1,000 requests a month.** That is roughly 33 a day, and one refresh can take more than one request. Updating every few minutes would use up the month in a few days.
- **iOS decides when a widget runs.** A script can ask to be woken, but iOS picks the actual moment and often runs it late. No home-screen widget can be truly live.

Enphase also publishes each 15-minute reading before it is complete, and takes about ten minutes to finish it. The widget waits for the finished reading before showing it as "current power", so that figure is typically 10 to 25 minutes behind the Enphase app.

### How it stays under 1,000 requests

- The widget counts every request it makes and keeps the running total for the month.
- It plans each month to about 950 requests and refuses to go past 990, leaving a margin under the limit.
- Nothing is requested between 10 PM and 5 AM.
- Production is requested about hourly while the sun is up.
- Consumption is requested every two hours, and hourly near the start and end of the day when the month has requests to spare.
- Daily totals and the fault check are requested once a day.
- Opening the script by hand only uses spare requests. If there are none, it shows saved data.

In simulated months, including heavy-use ones, the busiest came to about 950 requests and no day went without data.

## Privacy

Everything stays on your phone. Setup saves two files in Scriptable's local storage: `overengineered-solar-config.json` (your settings and keys) and `overengineered-solar-token.json` (your Enphase login tokens). The scripts talk only to Enphase, to Open-Meteo for weather, and to Zippopotam.us to turn your ZIP code into coordinates.

## Debugging

Run the widget script inside Scriptable. It shows a status report and copies it to the clipboard. Keys and tokens appear only as their last four characters. The setup script copies a similar report when it finishes.

## Support

This widget is free and always will be for personal use. If it's useful to you and you'd like to say thanks, you can buy me a coffee: [buymeacoffee.com/overengineeredtech](https://buymeacoffee.com/overengineeredtech)

<img src="images/support-qr.png" alt="QR code for the Buy Me a Coffee page" width="160">
