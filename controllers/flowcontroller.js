const UnusualTrade = require('../models/unusualTrade');
const TickerDetail = require('../models/tickerDetail');
const SectorWeight = require('../models/sectorweight');
const fs = require('fs');
const path = require('path');
const serverOutput = path.join(__dirname, '..', 'public', 'outputs', 'server.txt');
const updateOutput = path.join(__dirname, '..', 'public', 'outputs', 'updates.txt');
const axios = require('axios');


const { cleanRequestDate, formatTD, formatCash, callDiscordAPI,
    fill, cleanUp, getClosestDayOfWeek, getWeekDay, isToday,
    scrapeYahoo, printOutput, clearOutput, scrapeSectorSpdr } = require('../utilities/functions');


//redirects / to /flow
module.exports.redirector = (req, res) => {
    printOutput('Redirecting from / to /flow', 'server');
    // console.log('Redirecting from / to /flow');
    res.redirect('/flow');
}

// Main unusual option table. pulls trade objects from mongo, transforms them and sends to front end.
// also creates a hashmap based on the ticker to count the sum of call and put premium for the day. 
// map: key = ticker, value = object with call/put count sum and call/put premium sum
module.exports.dailyFlow = async (req, res) => {

    //req.query expects ?day=08.05.2021, if not that then redirect to flow with no query.
    //no query will pull the last record and use that date
    let pullDate;
    if (!req.query.day) {
        let lastRecord = await UnusualTrade.find({}).sort({ _id: -1 }).limit(1);

        pullDate = lastRecord[0].tradeDate;
        pullDate.setHours(0, 0, 0, 0);
    } else {
        let requestDate = req.query.day;
        pullDate = cleanRequestDate(requestDate);
        if (pullDate == null) {
            printOutput('Redirecting to /flow due to invalid query input of: ?day=' + req.query.day, 'server');
            // console.log('Redirecting to /flow due to invalid query input of: ?day=' + req.query.day);
            return res.redirect('/flow');
        }
        if (pullDate.getDay() == 0) { //if sunday
            printOutput('Requested date was a Sunday --> skipping back to Friday.', 'server');
            // console.log('Requested date was a Sunday --> skipping back to Friday.');
            pullDate = new Date(pullDate.getFullYear(), pullDate.getMonth(), pullDate.getDate() - 2);
            return res.redirect(`/flow?day=${pullDate.getMonth() + 1}.${pullDate.getDate()}.${pullDate.getFullYear()}`);

        } else if (pullDate.getDay() == 6) { //if saturday
            printOutput('Requested date was a Saturday --> skipping to Monday.', 'server');
            // console.log('Requested date was a Saturday --> skipping to Monday.');
            pullDate = new Date(pullDate.getFullYear(), pullDate.getMonth(), pullDate.getDate() + 2);
            return res.redirect(`/flow?day=${pullDate.getMonth() + 1}.${pullDate.getDate()}.${pullDate.getFullYear()}`);
        }
    }

    //once pulldate is estanblished, pullEndDate = pullDate++, pullendDate2 = pullEndDate++
    let pullEndDate = new Date(pullDate.getFullYear(), pullDate.getMonth(), pullDate.getDate() + 1);

    //display trades between pullDate and PullEndDate -- in thise case one day
    let displayTrades = await UnusualTrade.find({ tradeDate: { $gte: pullDate, $lte: pullEndDate } }).sort({ tradeDate: -1 }).lean();

    let map = new Map();

    for (trade of displayTrades) {

        //format on server side for front end 
        let pstTime = new Date(trade.tradeDate.getFullYear(), trade.tradeDate.getMonth(), trade.tradeDate.getDate());
        pstTime.setHours(trade.tradeDate.getHours() - 3, trade.tradeDate.getMinutes(), trade.tradeDate.getSeconds(), 0);
        trade.tradeDate = formatTD(pstTime);
        trade.expiry = formatTD(trade.expiry)[0];

        //map stuff
        if (!map.has(trade.ticker)) {
            if (trade.optionType == 'Call') {
                map.set(trade.ticker, { call: 1, callPrem: trade.premium, put: 0, putPrem: 0 });
            } else {
                map.set(trade.ticker, { call: 0, callPrem: 0, put: 1, putPrem: trade.premium });
            }
        } else {
            let obj = map.get(trade.ticker);

            if (trade.optionType == 'Call') {
                obj.call++;
                obj.callPrem = obj.callPrem + trade.premium;

            } else {
                obj.put++;
                obj.putPrem = obj.putPrem + trade.premium;
            }
            map.set(trade.ticker, obj);
        }
    }

    let mapArray = [];
    //when you iterate thru a map, each item is an array: [key, {val1: val1, val2: val2}]
    for (entry of map) {
        entry[1].formattedCall = formatCash(entry[1].callPrem);
        entry[1].formattedPut = formatCash(entry[1].putPrem);
        mapArray.push(entry);
    }

    //sort the map by highest total prmium spent on this day
    mapArray.sort((a, b) => {
        if (a[1].callPrem + a[1].putPrem < b[1].callPrem + b[1].putPrem) {
            return 1;
        } else {
            return -1;
        }
    })

    // yesterdayQuery, tomorrowQuery for the calendar navigation buttons
    let yesterday = new Date(pullDate.getFullYear(), pullDate.getMonth(), pullDate.getDate() - 1);
    let yesterdayQuery = `${yesterday.getMonth() + 1}.${yesterday.getDate()}.${yesterday.getFullYear()}`;
    let tomorrowQuery = `${pullEndDate.getMonth() + 1}.${pullEndDate.getDate()}.${pullEndDate.getFullYear()}`;

    printOutput('Rendering full table with: ' + displayTrades.length + ' documents.', 'server');
    // console.log('Rendering full table with: ' + displayTrades.length + ' documents.');
    res.render('flow/dailyTable', { title: "UnusualOptions", displayTrades, date: pullDate.toLocaleString('en-US', { dateStyle: 'long' }), day: getWeekDay(pullDate), isToday: isToday(pullDate), mapArray: mapArray, yesterdayQuery, tomorrowQuery });
}


//search ticker from navbar just redirects to /flow:ticker
module.exports.search = async (req, res) => {
    printOutput('Search query is: ' + req.query.ticker + '. Redirecting to /flow', 'server');
    // console.log('Search query is: ' + req.query.ticker + '. Redirecting to /flow');
    let ticker = req.query.ticker;
    ticker = ticker.trim();
    if (ticker.length > 5 || ticker.includes('$')) { //prevent mongo injection
        printOutput('Unclean query. Redirecting to /flow', 'server');
        // console.log('Unclean query. Redirecting to /flow');
        return res.redirect('/flow');
    }
    res.redirect(`/flow/${ticker}`);
}

//main view for one ticker. shows all trades in mongo for this ticker
module.exports.tickerFlow = async (req, res) => {
    //tranform to uppercase
    let ticker = (req.params.ticker).toUpperCase();

    // get the company name from the tickerdetail collection
    let compName = await TickerDetail.findOne({ ticker: ticker });
    if (compName) {
        compName = compName.companyName;
    } else {
        compName = '';
    }
    // get all trades from mongo related to this ticker
    let displayTrades = await UnusualTrade.find({ ticker: ticker }).sort({ tradeDate: -1 }).lean();

    for (trade of displayTrades) {
        //format on server side for front end 
        let pstTime = new Date(trade.tradeDate.getFullYear(), trade.tradeDate.getMonth(), trade.tradeDate.getDate());
        pstTime.setHours(trade.tradeDate.getHours() - 3, trade.tradeDate.getMinutes(), trade.tradeDate.getSeconds(), 0);
        trade.tradeDate = formatTD(pstTime);
        trade.expiry = formatTD(trade.expiry)[0];
    }
    printOutput('Rendering table for ' + ticker + '. ' + displayTrades.length + ' documents.', 'server');
    // console.log('Rendering table for ' + ticker + '. ' + displayTrades.length + ' documents.');
    res.render('flow/tickerTable', { title: "Ticker", displayTrades, ticker, compName });

}

//pull the scraped earnings data from the DB
module.exports.earningsData = async (req, res) => {
    let pullDate;
    if (!req.query.day) {
        //if no day query provided goto today and establish puyllDate
        pullDate = new Date();
        pullDate.setHours(0, 0, 0, 0);
    } else {
        //establish pullDate
        let requestDate = req.query.day;
        pullDate = cleanRequestDate(requestDate);
        if (pullDate == null) {
            printOutput('Redirecting to /flow/earningsDate due to invalid query input of: ?day=' + req.query.day, 'server');
            // console.log('Redirecting to /flow/earningsDate due to invalid query input of: ?day=' + req.query.day);
            return res.redirect('/flow/earningsDate');
        }
    }

    //once pulldate is established, pullEndDate = pullDate++
    let pullEndDate = new Date(pullDate.getFullYear(), pullDate.getMonth(), pullDate.getDate() + 1);
    //display earnings between pullDate and PullEndDate -- in thise case one day
    let displayEarnings = await TickerDetail.find({ earningsDate: { $gte: pullDate, $lt: pullEndDate } }).sort({ ticker: 1 }).lean();

    // yesterdayQuery, tomorrowQuery for the calendar navigation buttons
    let yesterday = new Date(pullDate.getFullYear(), pullDate.getMonth(), pullDate.getDate() - 1);
    let yesterdayQuery = `${yesterday.getMonth() + 1}.${yesterday.getDate()}.${yesterday.getFullYear()}`;
    let tomorrowQuery = `${pullEndDate.getMonth() + 1}.${pullEndDate.getDate()}.${pullEndDate.getFullYear()}`;
    printOutput('Rendering Earnings Tables. Displaying ' + displayEarnings.length + ' documents.', 'server');
    // console.log('Rendering Earnings Tables. Displaying ' + displayEarnings.length + ' documents.');
    res.render('flow/earningsTable', { title: "Earnings", displayEarnings, date: pullDate.toLocaleString('en-US', { dateStyle: 'long' }), day: getWeekDay(pullDate), isToday: isToday(pullDate), yesterdayQuery, tomorrowQuery });
}


//pull last sectorweight record from db and display
module.exports.sectors = async (req, res) => {

    let lastRecord = await SectorWeight.find({}).sort({ _id: -1 }).limit(1);
    if (lastRecord.length == 0) {
        await scrapeSectorSpdr();
        lastRecord = await SectorWeight.find({}).sort({ _id: -1 }).limit(1);
    }
    lastRecord = lastRecord[0];
    let sectorNames = ["XLE", "XLU", "XLK", "XLB", "XLP", "XLY", "XLI", "XLC", "XLV", "XLF", "XLRE"];
    let thinkscript = '';
    sectorNames.forEach((ele, idx) => {
        thinkscript = thinkscript + `def ${sectorNames[idx]}_weight = ${lastRecord[sectorNames[idx]]};\n`
    })
    let currentDate = lastRecord.date;
    lastRecord.string = thinkscript;
    // console.log('thinkscript code created: ')
    // console.log(thinkscript);
    res.render('flow/spdrSectors', {
        title: "S&P500 Sectors", date: currentDate.toLocaleString('en-US', { dateStyle: 'long' }), day: getWeekDay(currentDate), result: lastRecord
    });
}



module.exports.manualFill = async (req, res) => {
    await fill();
    printOutput('Manually pulled Discord. Redirecting from /flow/fill to /flow', 'server');
    // console.log('Manually pulled Discord. Redirecting from /flow/fill to /flow');
    res.redirect('/flow');
}

module.exports.manualScrape = async (req, res) => {
    scrapeYahoo();
    printOutput('Manually scraped Yahoo. redirecting from /flow/scrape to /flow', 'server');
    // console.log('Manually scraped Yahoo. redirecting from /flow/scrape to /flow')
    res.redirect('/flow');
}

module.exports.deleteDB = async (req, res) => {
    await UnusualTrade.deleteMany({});
    printOutput('Database  deleted. Redirecting from /flow/delete to /flow', 'server');
    // console.log('Database  deleted. Redirecting from /flow/delete to /flow')
    res.redirect('/flow');
}

//route to view server logs
module.exports.serverLogs = async (req, res) => {

    res.render('flow/serverLog', { title: 'Server Logs' });

}

//route to view update logs
module.exports.updatesLogs = async (req, res) => {

    res.render('flow/updatesLog', { title: 'Updates Logs' });

}

//render password screen via get
module.exports.passwordScreen = async (req, res) => {
    //look for pwtoken cookie
    if (req.signedCookies.pwtoken != undefined && req.signedCookies.pwtoken == process.env.COOKIE_VALUE) {
        //if they have the cookie, redirect them to /
        return res.redirect('/');
    }
    printOutput('User at password screen', 'server');
    //show password screen
    return res.render('flow/authScreen', { title: 'Unusual Options Flow' });

}

//enter password via post
module.exports.enterPassword = async (req, res) => {
    if (req.body.password == process.env.PASSWORD) {
        //if enter the correct password, deliver cookie and redirect to flow
        //cookie is signed and will last 1 hour
        res.cookie('pwtoken', process.env.COOKIE_VALUE, { signed: true, expires: new Date(Date.now() + (1000 * 60 * 60 * 10)), httpOnly: true })
        res.redirect('/flow');
    } else {
        //if they don't, redirect to same page.
        res.clearCookie("pwtoken");
        res.redirect('/auth');

    }
    printOutput('User entered password', 'server');


}