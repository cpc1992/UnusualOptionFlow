const axios = require('axios');
const { syncWait, printOutput } = require('./utilities/functions');

requester();

async function requester() {

    let count = 0;
    let date = new Date();
    let endDate = new Date();
    endDate.setHours(14, 0, 0, 0);


    printOutput('Starting ping job. Will ping every 29 minutes. 16 times from 6am-2pm', 'updates');
    console.log('Starting ping job. Will ping every 29 minutes. 16 times from 6am-2pm');
    while (count < 16 && date < endDate) {

        let url = 'https://unusualoptionflow.herokuapp.com/flow';

        let result = await axios.get(url);
        console.log(date.toLocaleString('en-US', { timeStyle: 'short' }) +
            ' end time is: ' + endDate.toLocaleString('en-US', { timeStyle: 'short' }) +
            ' count is: ' + count);

        await syncWait(1740000); //29 min interval

        count++;
        date = new Date();
        printOutput('Done waiting 29 min -- pinging site', 'updates');
        console.log('Done waiting 29 min -- pinging site');
    }
    printOutput('We are done pinging the site today', 'updates');
    console.log('We are done pinging the site today');
}


