# Light the Way

A small daily habit app for working toward **one goal at a time**.
Each day you get one task. Finish it and a lantern lights up on your path to the goal.
Missed a day? Nothing is lost: your task waits for you.

## How it works

1. **Set your goal.** Write what you want to achieve, why it matters, how many minutes a day you can give, and when and where you'll do it.
2. **Get a daily plan from Claude.** The app writes a prompt for you. Copy it into [Claude](https://claude.ai), then paste Claude's reply back into the app.
3. **Do one task a day.** Mark it done, or do the 2-minute "tiny version" on hard days. Both light a lantern.
4. **Watch your path light up** until you reach the flag.

## Features

- One task per day, and a missed task waits instead of being skipped
- Lantern path that shows your progress
- A new quote or affirmation every time you open the app
- Streak with grace: missing one day keeps your streak; the app nudges you not to miss twice
- "How did it feel?" check-in after each task
- Back up and restore your progress as a file
- Start over, with a confirmation so you don't lose progress by accident

## Privacy

Everything is stored in your own browser (`localStorage`). Nothing is sent to a server.
Each person who opens the app on their own device gets their own private path.
Clearing your browser data removes your progress, so use **Back up** now and then.

## Run it locally

No build step and no dependencies. Open `index.html` in a browser.

## Project files

| File | What it does |
|---|---|
| `index.html` | Page structure for every screen |
| `styles.css` | Colors, fonts and layout |
| `quotes.js` | Quotes and affirmations shown on each visit |
| `path.js` | Draws the lantern path |
| `app.js` | Goals, daily tasks, streaks, backup and reset |

## Roadmap

- Multiple goals
- Weekly review
- Calendar reminders
- Accounts and sync across devices
- Reminder notifications and emails
- Claude suggestions built into the app
