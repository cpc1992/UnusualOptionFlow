const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UnusualTradeSchema = new Schema({
    messageID: String,
    ticker: String,
    tradeDate: Date,
    expiry: Date,
    strike: Number,
    optionType: String,
    spot: Number,
    quantity: Number,
    price: Number,
    type: String,
    premium: Number,
    formattedCash: String,
    earningsPlay: Boolean,
    itm: Boolean,
    shortDTE: Boolean

})


module.exports = mongoose.model('UnusualTrade', UnusualTradeSchema);