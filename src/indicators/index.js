const { RVI } = require('./rvi');
const { VO } = require('./vo');
const { CMO } = require('./cmo');
const { BAB } = require('./bullandbear');
const { CCI } = require('./cci');
const { SLOW_STOCH } = require('./stochastic');

exports.indicator = { RVI, CMO, VO, BAB, CCI, SLOW_STOCH };
