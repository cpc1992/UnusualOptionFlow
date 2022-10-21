const UnusualTrade = require('../models/unusualTrade');
const TickerDetail = require('../models/tickerDetail');
const SectorWeight = require('../models/sectorweight');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const serverOutput = path.join(__dirname, '..', 'public', 'outputs', 'server.txt');
const updateOutput = path.join(__dirname, '..', 'public', 'outputs', 'updates.txt');
const puppeteer = require('puppeteer');

//takes in request date from req.query (08.05.92) and checks if they are valid then returns a Date object of requested date. or null if not valid. 
function cleanRequestDate(reqdate) {
    let dateArray = reqdate.split('.');
    if (dateArray.length == 3 &&
        parseInt(dateArray[0]) &&
        parseInt(dateArray[1]) &&
        parseInt(dateArray[2])) {
        let date = new Date(parseInt(dateArray[2]), parseInt(dateArray[0]) - 1, parseInt(dateArray[1]));
        if (isNaN(date)) {
            printOutput('Error: Valid input, but invalid date', 'server');
            // console.log('Error: Valid input, but invalid date');
            return null;
        } else {
            date.setHours(0, 0, 0, 0);
            printOutput("Requested date is: " + date.toLocaleString('en-US', { dateStyle: 'long' }), 'server');
            // console.log("Requested date is: " + date.toLocaleString('en-US', { dateStyle: 'long' }));
            return date;
        }

    } else {
        printOutput('Error: invalid input', 'server');
        // console.log('Error: invalid input');
        return null;
    }

}

//convert date object to an array of date and time in format: 08-05-21 and 01:38 PM
function formatTD(date) {
    let dateTime = [];
    let ampm = 'AM';
    let hours = date.getHours();
    if (hours >= 12) {
        ampm = 'PM';
    }
    hours = ((hours + 11) % 12 + 1);

    dateTime.push(("0" + (date.getMonth() + 1)).slice(-2) +
        "-" +
        ("0" + date.getDate()).slice(-2) +
        "-" +
        ("" + date.getFullYear()).slice(-2));
    dateTime.push(("0" + hours).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2) + " " + ampm);
    dateTime.push(date);
    return dateTime;
}

//convert a large number to shorthand format: 1.5K 2.6M 10M 15K
function formatCash(n) {
    if (n < 1e3) return n;
    if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(1) + "K";
    if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(1) + "M";
    if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(1) + "B";
    if (n >= 1e12) return +(n / 1e12).toFixed(1) + "T";
}

//call discord api to pull messages from channel. 100 messages after the messageid passed. 
async function callDiscordAPI(messageID) {

    let lastMessage = messageID;
    let channel = process.env.OPTION_FLOW_CHANNEL;
    let api = `https://discord.com/api/v9/channels/${channel}/messages`;
    let config = {
        headers: { Authorization: process.env.DISCORD_AUTH },
        params: {
            after: lastMessage, limit: 100
        }
    };
    return await axios.get(api, config);
}

// calls the discord API and transforms/cleans the data it receives into an array of objects that are inserted into mongo
async function fill() {
    let complete = false;
    while (complete == false) {
        let chain = [];
        let lastMessageID = '';

        // get last record or seed from first trade of August 2021
        let lastRecord = await UnusualTrade.find({}).sort({ _id: -1 }).limit(1);
        if (lastRecord.length == 0) {
            lastMessageID = process.env.SEED_RECORD;
            printOutput('Starting from seed august 2nd: ' + lastMessageID, 'updates');
            // console.log('Starting from seed august 2nd: ' + lastMessageID);

        } else {
            lastMessageID = lastRecord[0].messageID;
            let now = new Date();
            printOutput(now.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) + ': Last document: ' + lastMessageID + " " + lastRecord[0].ticker, 'updates');
            // console.log(now.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) + ': Last document: ' + lastMessageID + " " + lastRecord[0].ticker);
        }

        //call API with last record
        let result = await callDiscordAPI(lastMessageID);
        await syncWait(1170);

        if (result.data.length < 100) {
            complete = true;
        }

        if (result.data.length > 0) {
            printOutput('just pulled ' + result.data.length + " docs. filling db now", 'updates');
            // console.log('just pulled ' + result.data.length + " docs. filling db now");
            for (let tradeData of result.data) {

                let valueArray = await cleanUp(tradeData);
                if (valueArray != null) {
                    //  [0]  Ticker
                    //  [1]  Time
                    //  [2]  Expiry
                    //  [3]  Strike
                    //  [4]  Call/Put
                    //  [5]  Spot
                    //  [6]  Details
                    //  [7]  Type
                    //  [8]  Premium
                    //  [9]  Score
                    //  [10] Quantity
                    //  [11] Price
                    //  [12] FormattedCash
                    //  [13] MessageID
                    //  [14] EarningsPlay
                    //  [15] ITM
                    //  [16] shortDTE
                    let formattedTrade = {
                        messageID: valueArray[13],
                        ticker: valueArray[0],
                        tradeDate: valueArray[1],
                        expiry: valueArray[2],
                        strike: valueArray[3],
                        optionType: valueArray[4],
                        spot: valueArray[5],
                        quantity: valueArray[10],
                        price: valueArray[11],
                        type: valueArray[7],
                        premium: valueArray[8],
                        formattedCash: valueArray[12],
                        earningsPlay: valueArray[14],
                        itm: valueArray[15],
                        shortDTE: valueArray[16]
                    };
                    chain.unshift(formattedTrade);

                } else {
                    printOutput('Bad message. Not added to db', 'updates');
                    // console.log('Bad message. Not added to db');
                }


            }
            await UnusualTrade.insertMany(chain);

        } else {
            printOutput('We are up to date on messages', 'updates');
            // console.log('We are up to date on messages');
            complete = true;
        }
    }
}

//The array looks like this: 
//  [0]  Ticker
//  [1]  Time
//  [2]  Expiry
//  [3]  Strike
//  [4]  Call/Put
//  [5]  Spot
//  [6]  Details
//  [7]  Type
//  [8]  Premium
//  [9]  Score
//  [10] Quantity
//  [11] Price
//  [12] FormattedCash
//  [13] MessageID
//  [14] EarningsPlay
//  [15] ITM
//  [16] shortDTE
async function cleanUp(tradeData) {
    //break the string down into an array at the keyword ' \n '
    let splitArray;
    if (tradeData.embeds[0] != undefined && tradeData.embeds[0].length != 0) {
        splitArray = tradeData.embeds[0].fields[0].value.split(" \n ");
    } else {
        let d = new Date();
        let formatd = d.toLocaleString('en-US', { timeStyle: 'short' });
        printOutput(formatd + ' Pulled a bad message: ' + tradeData + '... Skipping it.', 'updates');
        // console.log(formatd + ' Pulled a bad message: ' + tradeData + '... Skipping it.');
        return null;
    }

    //add ticker to array[0];
    let ticker = tradeData.embeds[0].fields[0].name;
    if (ticker.includes('/')) {
        ticker = ticker.replace('/', '.');
    }
    splitArray.unshift(ticker);

    //delete all labels
    for (let i = 1; i < splitArray.length; i++) {
        splitArray[i] = splitArray[i].split(': ')[1];
    }

    //format call/put in array[4]
    if (splitArray[4].includes('C')) {
        splitArray[4] = 'Call';
    } else {
        splitArray[4] = 'Put';
    }

    //format tradedate in array[1]
    let colonSplitArray = splitArray[1].split(':');
    let spaceSplitArray = colonSplitArray[1].split(' ');

    let hourOfTrade = parseInt(colonSplitArray[0]);
    let minOfTrade = parseInt(spaceSplitArray[0]);
    let ampm = spaceSplitArray[1];

    //convert hours to 24 hour format
    if (ampm == 'AM' && hourOfTrade == '12') {
        // catching edge-case of 12AM
        hourOfTrade = "00";
    } else if (ampm == 'PM') {
        // everything with PM can just be mod'd and added with 12 - the max will be 23
        hourOfTrade = (hourOfTrade % 12) + 12
    }

    //grab date from timestamp and set the time from our calculations above
    let dateOfTrade = new Date(tradeData.timestamp);
    dateOfTrade.setHours(hourOfTrade, minOfTrade, 00);
    splitArray[1] = dateOfTrade;

    //format expiry in array[2]
    let exp = new Date(splitArray[2]);
    splitArray[2] = exp;

    //split up details 
    let details = splitArray[6];
    let detArray = details.split('@');

    //add quantity to array[10]
    let quantity = parseInt(detArray[0].trim().replace(/,/g, ''));
    splitArray.push(quantity);

    //add price to array[11]
    let price = parseFloat(detArray[1].trim());
    splitArray.push(price);

    //add premium to array[8]
    let premium = parseInt(quantity * price * 100);
    splitArray[8] = premium;

    //add formattedcash to array[12]
    let formatted = formatCash(splitArray[8]);
    splitArray.push(formatted);

    //add message ID in array[13]
    let messageID = tradeData.id;
    splitArray.push(messageID);

    //V--------------Do the calculations for the flags-----------------V

    //once pulldate is established, pullEndDate = pullDate++, pullendDate2 = pullEndDate++
    let pullDate = new Date(splitArray[1].getFullYear(), splitArray[1].getMonth(), splitArray[1].getDate());

    pullDate.setHours(0, 0, 0, 0);
    let pullEndDate = new Date(pullDate.getFullYear(), pullDate.getMonth(), pullDate.getDate() + 1);
    let pullEndDate2 = new Date(pullEndDate.getFullYear(), pullEndDate.getMonth(), pullEndDate.getDate() + 1);

    //gets earnings for today after market close or tomorroe before market open. 
    let earningsLaterToday = await TickerDetail.find({ earningsDate: { $gte: pullDate, $lt: pullEndDate }, earningsString: 'After Market Close' }).lean();
    let earningsTomorrowMorning = await TickerDetail.find({ earningsDate: { $gte: pullEndDate, $lt: pullEndDate2 }, earningsString: 'Before Market Open' }).lean();
    let upcomingEarnings = earningsLaterToday.concat(earningsTomorrowMorning);

    //calculate the closest friday to check if shortDTE
    let nextFriday = getClosestDayOfWeek(pullDate, 5);
    nextFriday.setHours(23, 59, 0, 0);

    //if earnings are coming up set earningsPlay to true
    let earningsPlay = false;
    if (upcomingEarnings.some((elem) => {
        if (elem.ticker == splitArray[0]) {
            return true;
        } else {
            return false;
        }
    })) {
        earningsPlay = true;
    }
    splitArray.push(earningsPlay);

    //if the option is in the money set itm to true. 
    let itm = false;
    if (splitArray[4] == 'Call') {
        //Call
        if (parseFloat(splitArray[3]) < parseFloat(splitArray[5])) { //Strike < spot
            itm = true;
        }
    } else {
        //Put
        if (parseFloat(splitArray[3]) > parseFloat(splitArray[5])) { //strike > spot
            itm = true;
        }
    }
    splitArray.push(itm);

    //if the expiry is within the week, set shortDTE to true
    let shortDTE = false;
    if (splitArray[2] < nextFriday) { //expiry < next friday
        shortDTE = true;
    }
    splitArray.push(shortDTE);

    return splitArray;
}

//scrapes Yahoo finance earnings page in this form:
// https://finance.yahoo.com/calendar/earnings?day=24-08-2021&offset=100&size=100 
// if the console start saying 0 items found... then Yahoo has rewritten their earnings page and this will need to re-worked. 
async function scrapeYahoo() {

    //starting from today. scrape 31 days out of earnings data.
    let todaysDate = new Date();
    let thisManyDays = 14;

    let baseSite = 'https://finance.yahoo.com/calendar/earnings';
    let weekCount = 0;
    let pulled = 0;

    do {
        //this loop loops from weekCount to thisManyDays

        let offset = 0;
        let dateQuery = `?day=${todaysDate.getFullYear()}-${("0" + (todaysDate.getMonth() + 1)).slice(-2)}-${("0" + todaysDate.getDate()).slice(-2)}`;
        printOutput(" -- Getting page for: " + todaysDate.toLocaleString('en-US', { dateStyle: 'short' }), 'updates');
        // console.log(" -- Getting page for: " + todaysDate.toLocaleString('en-US', { dateStyle: 'short' }));
        do {
            await syncWait(1000);
            //this loop loops the offset of the table pagination. yahoo finance only shows 100 rows at a time.
            let offsetQuery = `&offset=${offset}&size=100`;
            let fullUrl = baseSite + dateQuery + offsetQuery;
            //pull the page data
            let { data } = await axios.get(fullUrl);
            //load it into cheerio
            let $ = cheerio.load(data);
            //select from the data where matches this pattern:
            let elemSelector = "#cal-res-table > div > table > tbody > tr";
            pulled = $(elemSelector).length;
            printOutput("Scraping " + fullUrl + ". " + pulled + " items found.", 'updates');
            // console.log("Scraping " + fullUrl + ". " + pulled + " items found.");

            //$elemSelector holds an array of all rows. 
            $(elemSelector).each(async function (i, e) {

                //iterate through each row and grab the ticker, company name, and earnings time.
                let tickerr = $(this).children(':nth-child(1)').text();
                let companyNm = $(this).children(':nth-child(2)').text();
                let earningStr = $(this).children(':nth-child(3)').text();

                let time = todaysDate;

                // if before market open set date to 6am. if after set date to 1:30pm. else midnight
                if (earningStr.includes('Before Market Open')) {
                    time.setHours(6, 0, 0, 0);
                } else if (earningStr.includes('After Market Close')) {
                    time.setHours(13, 30, 0, 0);
                } else {
                    earningStr = 'Time Not Supplied';
                    time.setHours(0, 0, 0, 0);
                }

                //if the ticker exists in the db, update it with new information. if not, write a new document
                const filter = { ticker: tickerr };
                const update = { companyName: companyNm, earningsDate: time, earningsString: earningStr };
                let doc = await TickerDetail.findOneAndUpdate(filter, update, {
                    new: true,
                    upsert: true // Make this update into an upsert
                });
            })
            //increase the offset to click through the pagination
            offset = offset + 100;
        } while (pulled == 100);

        //the yahoo finance calendar page sometimes shows duplicates leading to not the right amount of docs inserted.
        //count how many were inserted for this day and re-run if needed. 
        let tomorrow = new Date(todaysDate.getFullYear(), todaysDate.getMonth(), todaysDate.getDate() + 1);
        let insertedd = await TickerDetail.find({ earningsDate: { $gte: todaysDate, $lt: tomorrow } }).countDocuments();
        printOutput("actually inserted " + insertedd, 'updates');
        // console.log("actually inserted " + insertedd);

        // move to the next day. 
        todaysDate.setDate(todaysDate.getDate() + 1);
        weekCount++;
    } while (weekCount < thisManyDays);

    return true;
}


// To get puppeteer to run on heroku i had to change the default browser launch parameters, install a buildpack, and clear the cache. then repush 
// 1) Declare browser as:
// const browser = await puppeteer.launch({
//                   headless: true,
//                   args: ['--no-sandbox','--disable-setuid-sandbox']
//                 })
// 2) Install heroku buildpack puppeteer heroku buildpack
// 3) Must clear heroku cache
// 4) git add .
//    git commit -m "some  text"
//    git push heroku master

async function scrapeSectorSpdr() {

    console.log('in scrape sector spider');

    //load the Url into puppeteer and launch a browser and page
    let fullUrl = 'https://www.sectorspdr.com/sectorspdr/';
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const page = await browser.newPage();
    await page.goto(fullUrl);
    console.log('browser up and page loaded')
    //Anything that happens in the evaluate, we can't see the console because it is in a simulated browser.
    let result = await page.evaluate(() => {
        //this stuff is running in the console of the simulated browser - can't access anything outside of this
        let sectorList = document.querySelectorAll("body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLE > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLU > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLK > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLB > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLP > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLY > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLI > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLC > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLV > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLF > div.idc-featurePie > table > tbody > tr > td:nth-child(1),body > div.idc-header > div > div > article > div > div.idc-featuretext.sectorPie-defaultHeght.sectorPie-content > div.sectorPie-divSector.sectorXLRE > div.idc-featurePie > table > tbody > tr > td:nth-child(1)");
        let sectorNames = ["XLE", "XLU", "XLK", "XLB", "XLP", "XLY", "XLI", "XLC", "XLV", "XLF", "XLRE"];
        let returnObj = {};

        sectorList.forEach((element, idx) => {
            //scrape the sector weight and save in return object
            let percent = element.innerText.trim().replace("%", "");
            returnObj[sectorNames[idx]] = percent;
        })
        //must return something to access it in node
        return returnObj;
    });
    console.log('page evaluated. heres the results:')
    console.log(result);

    if (result.XLE != undefined) {
        //create sector weight mongo document from the scraped info
        let sWeight = new SectorWeight({

            date: new Date(),
            XLE: result.XLE,
            XLU: result.XLU,
            XLK: result.XLK,
            XLB: result.XLB,
            XLP: result.XLP,
            XLY: result.XLY,
            XLI: result.XLI,
            XLC: result.XLC,
            XLV: result.XLV,
            XLF: result.XLF,
            XLRE: result.XLRE
        });

        //insert it into the collection.
        sWeight.save();
        console.log('document saved')
    } else {
        console.log('result came back with undefined values. skipping')
    }


    //close the browser
    await browser.close();
    return result;
}

//this is a stub, cuz scraping takes too long while testing.
async function scrapeSectorSpdrxxx() {
    let result = {
        string: "def XLE_weight = 4.07;\ndef XLU_weight = 2.78;\ndef XLK_weight = 26.98;\ndef XLB_weight = 2.63;\ndef XLP_weight = 6.24;\ndef XLY_weight = 11.48;\ndef XLI_weight = 8.13;\ndef XLC_weight = 9.34;\ndef XLV_weight = 13.98;\ndef XLF_weight = 11.60;\ndef XLRE_weight = 2.77;\n",
        XLE: 4.07,
        XLU: 2.78,
        XLK: 26.98,
        XLB: 2.63,
        XLP: 6.24,
        XLY: 11.48,
        XLI: 8.13,
        XLC: 9.34,
        XLV: 13.98,
        XLF: 11.60,
        XLRE: 2.77

    };

    return result;
}


//given a date and a target day of the week, returns the following monday/tuesday/wednesdauy.. etc
// mon = 1, trues = 2, wed = 3, thurs = 4, fri = 5, sat = 5, sun = 7
function getClosestDayOfWeek(date, dayOfWeek) {
    date = new Date(date.getTime());
    date.setDate(date.getDate() + ((dayOfWeek + 7 - date.getDay()) % 7));
    return date;
}

//synchronous waiting so Yahoo doesnt kick me off. 
function syncWait(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms) });
}

//converts dat.getDay() to Monday, Tuesday, Wednesday, etc
function getWeekDay(date) {
    let days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

// return true if date inputted is today.
function isToday(someDate) {
    const today = new Date();
    return someDate.getDate() == today.getDate() &&
        someDate.getMonth() == today.getMonth() &&
        someDate.getFullYear() == today.getFullYear();
}

function printOutput(string, filename) {
    let file;
    switch (filename) {
        case 'server':
            file = serverOutput;
            break;
        case 'updates':
            file = updateOutput;
            break;
        default:
            console.log('Print output missing filename');
            return;
    }

    fs.appendFile(file, new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' }) + ': ' + string + '\r\n', function (err) {
        if (err) throw err;
    });
}

function clearOutput() {
    console.log('in clear output');

    fs.writeFile(serverOutput, '', function (err) {
        if (err) throw err;
    });
    fs.writeFile(updateOutput, '', function (err) {
        if (err) throw err;
    });
}


module.exports.cleanRequestDate = cleanRequestDate;
module.exports.formatTD = formatTD;
module.exports.formatCash = formatCash;
module.exports.callDiscordAPI = callDiscordAPI;
module.exports.fill = fill;
module.exports.cleanUp = cleanUp;
module.exports.scrapeYahoo = scrapeYahoo;
module.exports.getClosestDayOfWeek = getClosestDayOfWeek;
module.exports.syncWait = syncWait;
module.exports.getWeekDay = getWeekDay;
module.exports.isToday = isToday;
module.exports.printOutput = printOutput;
module.exports.clearOutput = clearOutput;
module.exports.scrapeSectorSpdr = scrapeSectorSpdr;
