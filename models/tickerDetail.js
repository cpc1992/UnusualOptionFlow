const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TickerDetailSchema = new Schema({
    ticker: String,
    companyName: String,
    earningsString: String,
    earningsDate: Date
})

module.exports = mongoose.model('TickerDetail', TickerDetailSchema);