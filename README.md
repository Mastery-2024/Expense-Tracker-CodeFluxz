# Expense Tracker

A full stack expense tracker built only with **HTML, CSS, JavaScript and Node.js**. All data is stored in plain text files, so there is no database server to install.

Developed as a Full Stack Web Development project by AR Krishna, Department of Computer Science and Engineering, Rajalakshmi Engineering College.

## Features

- Add users by name, each with a separate record
- Record money in and money out with amount, category, date and note
- Automatic total money in, total money out and balance
- Category-wise spending summary
- Filter transactions by All, In or Out
- Remove transactions
- Light and dark modes (your choice is remembered)
- Responsive layout for desktop, tablet and mobile

## Tech Stack

| Part | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js (built-in modules only, no npm packages) |
| Database | Plain text files |

## Project Structure

```
expense_tracker/
├── server.js        # Node.js backend: API, validation, calculations
├── app.html         # Page structure
├── app.css          # Styling and light/dark themes
├── app.js           # Frontend logic
└── database/
    └── database.txt # User index (user files are created here)
```

## How to Run

1. Install [Node.js](https://nodejs.org) (LTS version).
2. Open a terminal in the project folder.
3. Start the server:

   ```bash
   node server.js
   ```

4. Open **http://localhost:3000** in your browser.

Do not open `app.html` by double-clicking it, because the page needs the server to work.

## How Data Is Stored

Each user has their own text file, so reads and writes only touch that user's data.

`database/database.txt` is the user index:

```
slug|Name|created time
```

`database/user_<name>.txt` holds one transaction per line:

```
# id|date|type|amount|category|note
a1b2c3|2026-11-01|in|30000.00|Salary|November salary
d4e5f6|2026-11-02|out|250.00|Food|Lunch
```

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Add a user |
| GET | `/api/users/:slug/transactions` | Get a user's transactions and summary |
| POST | `/api/users/:slug/transactions` | Add money in or money out |
| DELETE | `/api/users/:slug/transactions/:id` | Remove a transaction |

## Reliability Notes

- Totals are calculated on the server in whole paise, so there are no rounding errors.
- Writes to the same file run one at a time.
- Deleting rewrites the file through a temporary file, so it is never left half written.
- User names become safe file names, and text is cleaned before it is saved.

## Future Enhancements

- Password-protected accounts
- Editing of transactions
- Monthly budgets with alerts
- Charts and CSV export

## Screenshots

Add your screenshots here.
