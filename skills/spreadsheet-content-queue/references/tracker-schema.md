# Tracker schema

Required headers: `Blog ID`, `Topic`, `Title`, `Status`, `Completed`, `Scheduled Date`, `Draft Path`, `Email Sent At`, `Error`. `Blog ID` is unique. A row is eligible only when Topic or Title is usable, Completed is blank/false/unchecked, Status is blank or pending, and Scheduled Date is not future-dated.
