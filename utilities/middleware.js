const { printOutput } = require('../utilities/functions');

function displayRequest(req, res, next) {
    // let date = new Date();
    let ipAddress = req.socket.remoteAddress || 'Unknown IP';
    printOutput(ipAddress + ' ---- ' + req.method + " " + req.path + ' ----', 'server');
    // console.log(date.toLocaleString('en-US', { timeStyle: 'short' }) + ' ---- ' + req.method + " " + req.path + ' ----');
    next();
}

function catchAsync(func) {
    return function (req, res, next) {
        func(req, res, next)
            .catch(error => next(error))
    }
}

function checkCookies(req, res, next) {

    if (req.signedCookies.pwtoken != undefined && req.signedCookies.pwtoken == process.env.COOKIE_VALUE) {
        next();
    } else {
        res.redirect('/auth');
    }
}

module.exports.displayRequest = displayRequest;
module.exports.catchAsync = catchAsync;
module.exports.checkCookies = checkCookies;