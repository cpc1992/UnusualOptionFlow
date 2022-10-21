const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SectorWeightSchema = new Schema({
    date: Date,
    XLE: Number,
    XLU: Number,
    XLK: Number,
    XLB: Number,
    XLP: Number,
    XLY: Number,
    XLI: Number,
    XLC: Number,
    XLV: Number,
    XLF: Number,
    XLRE: Number
})

module.exports = mongoose.model('SectorWeight', SectorWeightSchema);