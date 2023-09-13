if (!process.env.PRODUCTION) {
    require('dotenv').config();
}
const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const { displayRequest, catchAsync, checkCookies } = require('./utilities/middleware');
const path = require('path');
const ejsmate = require('ejs-mate');
const mongoose = require('mongoose');
const schedule = require('node-schedule');
const { dailyFlow, tickerFlow, redirector, search, manualFill, earningsData, manualScrape, serverLogs, updatesLogs, sectors, passwordScreen, enterPassword } = require('./controllers/flowcontroller');
const { fill, scrapeYahoo, printOutput, clearOutput, scrapeSectorSpdr } = require('./utilities/functions');

app.engine('ejs', ejsmate);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, "/views"));
app.use(express.urlencoded({ extended: true }));

// remove static public folder for vercel configuration or not
app.use(express.static('public'));

//'mongodb://localhost:27017/options'
const dbURL = process.env.DB_URL;

mongoose.connect(dbURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false
})
    .then(async () => {
        console.log('db connected');
    })
    .catch(async (err) => {
        console.log('error connecting db');
    })

/*
        cron notation:
 +------------------- second (0 - 60)
 |  +---------------- minute (0 - 59)
 |  |  +------------- hour (0 - 23)
 |  |  |  +---------- day of month (1 - 31)
 |  |  |  |  +------- month (1 - 12)
 |  |  |  |  |  +---- day of week (0 - 6) (Sunday=0 or 7)
 |  |  |  |  |  |
 *  *  *  *  *  *
*/

// pull discord messages. this job will run: every 30 seconds, every minute, from hours 6am - 2pm, every day, every month, Only Mon - Fri
// const pullDiscord = schedule.scheduleJob('*/30 * 6-13 * * 1-5', fill);

// scrape yahoo earnings data. this job will run: Once a day a 6:15am, every day, every month, only mon-friday
// const pullYahoo = schedule.scheduleJob('0 15 6 * * 1-5', scrapeYahoo);

// clear logs. this job will run: at 6:14 am, every monday
// const clearLogs = schedule.scheduleJob('0 14 6 * * 1', clearOutput);

// scrape sector percentages. this job will run: Once a day a 6:15am, every day, every month, only mon-friday
// const scrapeSectors = schedule.scheduleJob('0 15 6 * * 1-5', scrapeSectorSpdr);

app.use(cookieParser(process.env.COOKIE_SECRET));

//middleware which prints output for every route accessed.
app.use(displayRequest);

//password screen routes: these must go before the checkCookies middleware
app.get('/auth', passwordScreen);
app.post('/auth', enterPassword);

//checkCookies middleware will check if they have the pwtoken cookie and redirect to auth if not
app.use(checkCookies);

app.get('/', redirector);

app.get('/flow', catchAsync(dailyFlow));

app.get('/flow/search', catchAsync(search));

app.get('/flow/earnings', catchAsync(earningsData));

//hidden route. manually pull discord
app.get('/flow/fill', catchAsync(manualFill));

//hidden route. manually scrape yahoo 14 days out
app.get('/flow/scrape', catchAsync(manualScrape));

//hidden routes. get logs
app.get('/flow/logs/server', catchAsync(serverLogs));
app.get('/flow/logs/updates', catchAsync(updatesLogs));

app.get('/flow/:ticker', catchAsync(tickerFlow));

app.get('/sectors', catchAsync(sectors));

app.use((err, req, res, next) => {

    printOutput('we are in the error handling middleware', 'server');
    printOutput(" --------------- error ------------", 'server');
    printOutput(err, 'server');

    // console.log('we are in the error handling middleware');
    // console.log(" --------------- error ------------");
    // console.log(err);

    if (!err.status) {
        err.status = 500;
    }
    res.render('commons/error', { title: 'Error', err });
})

const port = process.env.PORT;
app.listen(port, () => {
    console.log('listening on port ' + port);
})