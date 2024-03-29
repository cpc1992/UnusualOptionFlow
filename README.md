# Unusual Options Flow

An app that compares unusually large stock option purchases and company earnings data in a table format.

Live site: https://unusual-option-flow.vercel.app

Note: All API calls and scraping functionality was turned off in June 2022.

## Description

The app uses the Discord API to pull in unusual stock option purchases and scrapes Yahoo Finance for company earnings data. 
The data is then compared to show if the option purchase coincides with upcoming company earnings. The purchase data is displayed per day in table format and is summarized on the left. It can also be searched by ticker.
A emoji flag will appear next to the option purchase indicating if the purchase is in the money, expiring soon, or occured within a day before the company earnings date.

## Technologies used

The front-end is written in HTML/CSS with help from Bootstrap.    
The back-end is handled by an ExpressJS server.  
The data is stored in a MongoDB database.  
The Scraping is done using Cheerio and Puppeteer.  

## Authors

Clifford Chan (cpc1992)
